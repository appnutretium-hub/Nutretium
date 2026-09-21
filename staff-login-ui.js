/* Nutretium staff MFA login interceptor */
(function () {
  'use strict';

  function setupBox(form) {
    let box=form.querySelector('[data-mfa-setup-box]');
    if(box)return box;
    box=document.createElement('div');
    box.dataset.mfaSetupBox='1';
    box.hidden=true;
    box.style.cssText='margin:12px 0;padding:12px;border:1px solid #4b3f14;border-radius:10px;background:#171407;color:#e7d38b;overflow-wrap:anywhere';
    box.innerHTML='<strong>Configura MFA para continuar</strong><p data-mfa-help style="margin:7px 0"></p><div data-mfa-secret style="font-family:ui-monospace,monospace;font-size:15px;letter-spacing:.06em;word-break:break-all"></div><button type="button" data-copy-mfa style="margin-top:8px">Copiar clave MFA</button>';
    const error=form.querySelector('.error')||document.getElementById('errorAcceso')||document.getElementById('loginError');
    if(error)error.insertAdjacentElement('beforebegin',box);else form.appendChild(box);
    box.querySelector('[data-copy-mfa]').addEventListener('click',async()=>{const secret=box.querySelector('[data-mfa-secret]').textContent;try{await navigator.clipboard.writeText(secret);box.querySelector('[data-copy-mfa]').textContent='Clave copiada';setTimeout(()=>box.querySelector('[data-copy-mfa]').textContent='Copiar clave MFA',1200)}catch{}});
    return box;
  }

  function showSetup(form,data,mfa,mfaLabel){
    const box=setupBox(form),secret=data?.mfa?.setupSecret||'';
    if(secret){
      box.hidden=false;
      box.querySelector('[data-mfa-help]').textContent='Añade esta clave en Google Authenticator, Microsoft Authenticator, 1Password u otra app TOTP. Después introduce abajo el código de 6 dígitos.';
      box.querySelector('[data-mfa-secret]').textContent=secret;
    }
    if(mfaLabel)mfaLabel.hidden=false;
    mfa.required=true;
    mfa.focus();
  }

  function setup() {
    const forms = [document.getElementById('formAcceso'), document.getElementById('loginForm')].filter(Boolean);

    for (const form of forms) {
      if (form.dataset.staffMfa) continue;
      form.dataset.staffMfa = '1';

      const email = form.querySelector('input[type="email"]');
      const password = form.querySelector('input[type="password"]');
      if (!email || !password) continue;

      let mfa = form.querySelector('#mfaCode,[data-staff-mfa]');
      let mfaLabel = mfa ? mfa.closest('label,.field') : null;

      if (!mfa) {
        mfaLabel = document.createElement('label');
        mfaLabel.textContent = 'Código MFA';
        mfa = document.createElement('input');
        mfa.id = 'mfaCode';
        mfa.type = 'text';
        mfa.inputMode = 'numeric';
        mfa.autocomplete = 'one-time-code';
        mfa.maxLength = 6;
        mfa.pattern = '[0-9]{6}';
        mfa.placeholder = '000000';
        mfa.dataset.staffMfa = '1';
        mfaLabel.appendChild(mfa);
        const anchor = password.closest('label, .field');
        if (anchor) anchor.insertAdjacentElement('afterend', mfaLabel);
        else password.insertAdjacentElement('afterend', mfaLabel);
      }

      if (mfaLabel) mfaLabel.hidden = true;
      mfa.required = false;
      setupBox(form);

      if (!form.querySelector('[data-password-recovery]')) {
        const recovery = document.createElement('button');
        recovery.type = 'button';
        recovery.dataset.passwordRecovery = '1';
        recovery.textContent = 'He olvidado mi contraseña';
        recovery.style.cssText = 'margin-top:10px;background:transparent;border:0;color:#d4af37;text-decoration:underline;cursor:pointer;padding:4px 0;font:inherit';
        recovery.addEventListener('click', () => {
          const value = email.value.trim();
          const query = value ? `?email=${encodeURIComponent(value)}` : '';
          location.href = `/mi-nutretium${query}`;
        });
        form.appendChild(recovery);
      }

      form.addEventListener(
        'submit',
        async event => {
          event.preventDefault();
          event.stopImmediatePropagation();

          const error = form.querySelector('.error') || document.getElementById('errorAcceso') || document.getElementById('loginError');
          const button = form.querySelector('button[type="submit"],button:not([type])');

          if (error) error.textContent = '';
          if (button) button.disabled = true;

          try {
            const response = await fetch('/.netlify/functions/staff-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: email.value.trim(), password: password.value, mfaCode: mfa.value.trim() }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
              if (data.mfaSetupRequired) showSetup(form,data,mfa,mfaLabel);
              else if (data.mfaRequired) { if (mfaLabel) mfaLabel.hidden = false; mfa.required = true; mfa.focus(); }
              throw new Error(data.error || 'No se pudo entrar.');
            }

            location.reload();
          } catch (err) {
            if (error) error.textContent = err.message;
            else alert(err.message);
            if (button) button.disabled = false;
          }
        },
        true
      );
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();
})();
