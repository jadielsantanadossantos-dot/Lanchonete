;(function(){
  function placeholderFor(img){
    if(img.dataset.fallbackDone) return;
    img.dataset.fallbackDone='1';
    var parent=img.parentElement;
    if(img.id==='modal-img'){ img.style.display='none'; return; }
    if(img.classList.contains('product-img')||img.classList.contains('g-produto-img')){
      var ph=document.createElement('div');
      ph.className='product-img-placeholder';
      ph.textContent='\uD83C\uDF54';
      ph.setAttribute('aria-hidden','true');
      img.replaceWith(ph);
      return;
    }
    if(parent && img.style.width==='50px' || img.getAttribute('style')&&img.getAttribute('style').indexOf('50px')!==-1){
      var d=document.createElement('div');
      d.style.cssText='width:50px;height:50px;border-radius:6px;background:var(--color-bg-alt, #f3f4f6);display:flex;align-items:center;justify-content:center;font-size:20px';
      d.textContent='\uD83C\uDF54';
      img.replaceWith(d);
      return;
    }
    img.style.display='none';
  }
  document.addEventListener('error',function(e){
    var t=e.target;
    if(t && t.tagName==='IMG'){ placeholderFor(t); }
  },true);
  window.handleImgError=function(img){ placeholderFor(img); };
})();
