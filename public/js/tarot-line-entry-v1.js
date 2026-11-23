// Fail closed: don't offer a bridge when its TROY deployment has not been configured.
fetch('/api/tarot/availability',{cache:'no-store',redirect:'error'})
  .then(response => response.ok ? response.json() : null)
  .then(result => {
    if (result?.enabled === true) {
      document.querySelectorAll('[data-troy-line-tabletop]').forEach(link => { link.hidden = false; link.style.removeProperty("display"); });
    }
  }).catch(() => {});
