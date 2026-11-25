(() => {
  const tags = document.querySelector('.tags');
  const list = document.querySelector('.list');
  const cards = [...list.querySelectorAll('.card')];
  const empty = list.querySelector('.empty');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 760px)');
  const studies = document.querySelector('#studies');
  const portfolio = document.querySelector('#work');
  const navigation = [...document.querySelectorAll('.view-nav a')];

  function syncVideos() {
    for (const card of cards) {
      const video = card.querySelector('video');
      if (studies.hidden || reduced.matches || mobile.matches || card.hidden || document.hidden) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    }
  }

  function showView() {
    const current = location.hash === '#studies' ? 'studies' : 'portfolio';
    studies.hidden = current !== 'studies';
    portfolio.hidden = current !== 'portfolio';
    for (const link of navigation) {
      if (link.dataset.view === current) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (location.hash === '#about') document.querySelector('#about').focus({ preventScroll: true });
    syncVideos();
  }

  tags.addEventListener('click', event => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    for (const chip of tags.querySelectorAll('button')) chip.setAttribute('aria-pressed', String(chip === button));
    const { filter } = button.dataset;
    for (const card of cards) card.hidden = filter !== 'all' && !card.dataset.tags.split(' ').includes(filter);
    empty.hidden = cards.some(card => !card.hidden);
    list.scrollTop = 0;
    syncVideos();
  });

  reduced.addEventListener('change', syncVideos);
  mobile.addEventListener('change', syncVideos);
  document.addEventListener('visibilitychange', syncVideos);
  window.addEventListener('hashchange', showView);
  showView();
})();
