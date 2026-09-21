'use strict';

const MFA_BYPASS_UNTIL_ISO='2026-09-22T18:00:00.000Z';
const MFA_BYPASS_UNTIL=Date.parse(MFA_BYPASS_UNTIL_ISO);

function privilegedMfaBypassActive(role,now=Date.now()){
  return ['owner','admin'].includes(String(role||''))&&Number(now)<MFA_BYPASS_UNTIL;
}

function claimAllowsPrivilegedBypass(role,claims={},now=Date.now()){
  return privilegedMfaBypassActive(role,now)&&claims?.mfaBypass===true&&Number(claims?.mfaBypassUntil||0)===MFA_BYPASS_UNTIL;
}

module.exports={MFA_BYPASS_UNTIL,MFA_BYPASS_UNTIL_ISO,privilegedMfaBypassActive,claimAllowsPrivilegedBypass};
