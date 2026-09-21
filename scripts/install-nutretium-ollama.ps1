param(
  [string]$PairCode = '',
  [string]$Model = 'qwen3:4b'
)
$ErrorActionPreference='Stop'
$Base='https://nutretium.com'
$Endpoint="$Base/.netlify/functions/ai-ollama-runner"
$RunnerId=("{0}-{1}" -f $env:COMPUTERNAME,$env:USERNAME).Substring(0,[Math]::Min(120,("{0}-{1}" -f $env:COMPUTERNAME,$env:USERNAME).Length))
$Root=Join-Path $env:LOCALAPPDATA 'NutretiumAI'
$TokenFile=Join-Path $Root 'runner.token.dpapi'
$RunnerFile=Join-Path $Root 'runner.ps1'
$TaskName='Nutretium AI Ollama Runner'
New-Item -ItemType Directory -Force -Path $Root | Out-Null

function Find-Ollama {
  $cmd=Get-Command ollama -ErrorAction SilentlyContinue
  if($cmd){return $cmd.Source}
  $candidates=@(
    (Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'),
    (Join-Path $env:LOCALAPPDATA 'Ollama\ollama.exe')
  )
  foreach($p in $candidates){if(Test-Path $p){return $p}}
  return $null
}

$ollama=Find-Ollama
if(-not $ollama){
  Write-Host 'Instalando Ollama desde ollama.com...'
  Invoke-Expression (Invoke-RestMethod 'https://ollama.com/install.ps1')
  $ollama=Find-Ollama
}
if(-not $ollama){throw 'Ollama no quedó disponible después de la instalación.'}

Write-Host "Descargando/verificando modelo $Model..."
& $ollama pull $Model
if($LASTEXITCODE -ne 0){throw "No se pudo descargar $Model."}

try{Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 5 | Out-Null}
catch{
  Write-Host 'Arrancando Ollama...'
  Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
  Start-Sleep -Seconds 4
  Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 10 | Out-Null
}

if(-not $PairCode){$PairCode=Read-Host 'Introduce el código de emparejamiento mostrado en AI Corporation'}
$pairBody=@{action='pair';runnerId=$RunnerId;code=$PairCode}|ConvertTo-Json -Compress
$pair=Invoke-RestMethod -Method Post -Uri $Endpoint -ContentType 'application/json' -Body $pairBody -TimeoutSec 30
if(-not $pair.ok -or -not $pair.token){throw 'Nutretium rechazó el emparejamiento.'}
$secure=ConvertTo-SecureString $pair.token -AsPlainText -Force
$secure | ConvertFrom-SecureString | Set-Content -Encoding UTF8 $TokenFile
$Model=if($pair.model){[string]$pair.model}else{$Model}

$runner=@'
$ErrorActionPreference='Stop'
$Base='https://nutretium.com'
$Endpoint="$Base/.netlify/functions/ai-ollama-runner"
$Ollama='http://127.0.0.1:11434'
$Root=Join-Path $env:LOCALAPPDATA 'NutretiumAI'
$TokenFile=Join-Path $Root 'runner.token.dpapi'
$RunnerId=("{0}-{1}" -f $env:COMPUTERNAME,$env:USERNAME).Substring(0,[Math]::Min(120,("{0}-{1}" -f $env:COMPUTERNAME,$env:USERNAME).Length))
function Read-Token {
  $s=Get-Content -Raw $TokenFile | ConvertTo-SecureString
  $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try{return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}
}
function Bridge([hashtable]$Body){
  $Body.runnerId=$RunnerId
  $token=Read-Token
  return Invoke-RestMethod -Method Post -Uri $Endpoint -Headers @{'x-nutretium-runner-token'=$token} -ContentType 'application/json' -Body ($Body|ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 45
}
function Complete($Job,$Text,$Model){Bridge @{action='complete';id=$Job.id;leaseId=$Job.leaseId;result=$Text;model=$Model}|Out-Null}
function Fail($Job,$Message){try{Bridge @{action='fail';id=$Job.id;leaseId=$Job.leaseId;error=$Message}|Out-Null}catch{}}
while($true){
  try{
    $claim=Bridge @{action='claim';leaseMs=300000}
    $job=$claim.job
    if(-not $job){Start-Sleep -Seconds 7;continue}
    try{
      $payload=@{model=$job.model;messages=$job.messages;stream=$false}|ConvertTo-Json -Depth 20 -Compress
      $response=Invoke-RestMethod -Method Post -Uri "$Ollama/api/chat" -ContentType 'application/json' -Body $payload -TimeoutSec 280
      $text=[string]$response.message.content
      if([string]::IsNullOrWhiteSpace($text)){throw 'Ollama devolvió una respuesta vacía.'}
      Complete $job $text ([string]$response.model)
    }catch{Fail $job $_.Exception.Message}
  }catch{
    Start-Sleep -Seconds 10
  }
}
'@
Set-Content -Path $RunnerFile -Value $runner -Encoding UTF8

$action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$RunnerFile`""
$trigger=New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Days 3650) -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Runner local de Nutretium AI Corporation para Ollama' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
$status=Invoke-RestMethod -Method Post -Uri $Endpoint -Headers @{'x-nutretium-runner-token'=$pair.token} -ContentType 'application/json' -Body (@{action='status';runnerId=$RunnerId}|ConvertTo-Json -Compress) -TimeoutSec 30
Write-Host ''
Write-Host 'NUTRETIUM AI OLLAMA: INSTALADO Y EMPAREJADO' -ForegroundColor Green
Write-Host "Runner: $RunnerId"
Write-Host "Modelo: $Model"
Write-Host "Tarea: $TaskName"
Write-Host "Cola: $($status.queue.total) trabajos"
