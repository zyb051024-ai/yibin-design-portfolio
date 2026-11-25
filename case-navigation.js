(() => {
  const navigation = document.querySelector('.case-nav');
  if (!navigation) return;

  const links = [...navigation.querySelectorAll('a[href^="#"]')];

  function updateChapter() {
    for (const link of links) {
      if (link.hash === window.location.hash) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  window.addEventListener('hashchange', updateChapter);
  updateChapter();
})();
