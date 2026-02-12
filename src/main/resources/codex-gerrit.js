// Gerrit plugin JavaScript bootstrap entrypoint.
// Gerrit 3.4 loads this file as declared by the Gerrit-JavaScript manifest entry.
(function () {
  const logPrefix = '[codex-gerrit-bootstrap]';
  const log = (...args) => console.log(logPrefix, ...args);
  const warn = (...args) => console.warn(logPrefix, ...args);

  const currentSrc = document.currentScript && document.currentScript.src;
  const baseUrl = currentSrc ? currentSrc.replace(/\/[^/]*$/, '') : '/plugins/codex-gerrit';
  const scriptUrl = `${baseUrl}/static/codex-gerrit.js`;

  log('Bootstrapping plugin script.', { currentSrc, scriptUrl });

  if (document.querySelector(`script[src="${scriptUrl}"]`)) {
    log('Main script already present, skipping duplicate load.');
    return;
  }

  const script = document.createElement('script');
  script.src = scriptUrl;
  script.async = false;
  script.onload = () => log('Main script loaded.');
  script.onerror = event => warn('Failed to load main script.', event);
  document.head.appendChild(script);
})();
