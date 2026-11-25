(() => {
  if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return;

  const preview = document.createElement('dialog');
  preview.className = 'asset-preview';
  preview.setAttribute('aria-labelledby', 'asset-preview-title');
  preview.innerHTML = `
    <div class="viewer-bar">
      <form method="dialog"><button class="viewer-control" autofocus>← 返回项目</button></form>
      <h2 id="asset-preview-title"></h2>
      <button class="viewer-control" type="button" data-full-size disabled>查看原尺寸</button>
    </div>
    <div class="asset-preview-body" tabindex="0" aria-label="图片预览，可滚动查看">
      <img alt="">
    </div>`;
  document.body.append(preview);

  const title = preview.querySelector('h2');
  const viewport = preview.querySelector('.asset-preview-body');
  const picture = preview.querySelector('img');
  const zoom = preview.querySelector('[data-full-size]');
  let opener;

  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-preview]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    opener = link;
    title.textContent = link.dataset.preview;
    picture.alt = link.querySelector('img')?.alt || link.dataset.preview;
    zoom.disabled = true;
    picture.src = link.href;
    if (picture.complete && picture.naturalWidth) zoom.disabled = false;
    preview.showModal();
    viewport.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });

  picture.addEventListener('load', () => {
    zoom.disabled = false;
  });

  zoom.addEventListener('click', () => {
    const bounds = viewport.getBoundingClientRect();
    const image = picture.getBoundingClientRect();
    const centerX = bounds.left + viewport.clientWidth / 2;
    const centerY = bounds.top + viewport.clientHeight / 2;
    const imageX = (centerX - image.left) / image.width;
    const imageY = (centerY - image.top) / image.height;
    const fullSize = viewport.classList.toggle('is-full-size');
    const resized = picture.getBoundingClientRect();
    viewport.scrollBy({
      left: resized.left + resized.width * imageX - centerX,
      top: resized.top + resized.height * imageY - centerY,
      behavior: 'instant'
    });
    zoom.textContent = fullSize ? '适合窗口' : '查看原尺寸';
  });

  preview.addEventListener('close', () => {
    picture.removeAttribute('src');
    viewport.classList.remove('is-full-size');
    zoom.textContent = '查看原尺寸';
    zoom.disabled = true;
    opener?.focus({ preventScroll: true });
  });
})();
