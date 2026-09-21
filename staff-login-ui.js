/* Nutretium staff MFA login interceptor */
(function () {
  'use strict';

  function setup() {
    const forms = [document.getElementById('formAcceso'), document.getElementById('loginForm')].filter(Boolean);

    for (const form of forms) {
      if (form.dataset.staffMfa) continue;
      form.dataset.staffMfa = '1';

      const email = form.querySelector('input[type="email"]');
      const password = form.querySelector('input[type="password"]');
      if (!email || !password) continue;

      let mfa = form.querySelector('#mfaCode,[data-staff-mfa]');
      let mfaLabel = mfa ? mfa.closest('label') : null;

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

          const error =
            form.querySelector('.error') ||
            document.getElementById('errorAcceso') ||
            document.getElementById('loginError');
          const button = form.querySelector('button[type="submit"],button:not([type])');

          if (error) error.textContent = '';
          if (button) button.disabled = true;

          try {
            const response = await fetch('/.netlify/functions/staff-login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: email.value.trim(),
                password: password.value,
                mfaCode: mfa.value.trim(),
              }),
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
              if (data.mfaRequired) {
                if (mfaLabel) mfaLabel.hidden = false;
                mfa.required = true;
                mfa.focus();
              } else if (data.mfaSetupRequired) {
                if (mfaLabel) mfaLabel.hidden = true;
                mfa.required = false;
              }
              throw new Error(data.error || 'No se pudo entrar.');
            }

            // El puente de seguridad ya ha canjeado el token efímero por una cookie HttpOnly.
            // No persistimos credenciales ni datos de sesión interna en Web Storage.
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
