;(function(){
  function categoriaIcon(nome, cat){
    var n=(nome||'').toLowerCase();
    var c=(cat||'').toLowerCase();
    var t=c+' '+n;
    if(/pizza/.test(t)) return '\uD83C\uDF55';
    if(/a[cç]a[ií]|acai/.test(t)) return '\uD83E\uDED0';
    if(/cachorro|hot\s*dog|dog/.test(t)) return '\uD83C\uDF2D';
    if(/hamb|burger|x-|\blanche|burguer/.test(t)) return '\uD83C\uDF54';
    if(/pastel/.test(t)) return '\uD83E\uDD5F';
    if(/coxinha|kibe|esfiha|salgad/.test(t)) return '\uD83E\uDD6E';
    if(/batata|frita|por[cç][aã]o|onion|anel/.test(t)) return '\uD83C\uDF5F';
    if(/suco|vitamina|natural/.test(t)) return '\uD83E\uDD64';
    if(/refri|coca|guaran|fanta|sprite|pepsi/.test(t)) return '\uD83E\uDD64';
    if(/cerveja|chopp|heineken|brahma|skol/.test(t)) return '\uD83C\uDF7A';
    if(/milk|shake/.test(t)) return '\uD83E\uDD64';
    if(/bebida|drink/.test(t)) return '\uD83E\uDD64';
    if(/pudim|sorvete|sobre|doce|a[cç]a[ií]/.test(t)) return '\uD83C\uDF68';
    if(/combo|promo/.test(t)) return '\uD83C\uDF54';
    return '\uD83C\uDF54';
  }
  function placeholderFor(img){
    if(img.dataset.fallbackDone) return;
    img.dataset.fallbackDone='1';
    var nome=img.getAttribute('alt')||img.dataset.nome||'';
    var cat=img.dataset.categoria||'';
    if(!cat){
      try{
        var card=img.closest('[data-categoria]');
        if(card) cat=card.getAttribute('data-categoria')||'';
      }catch(e){}
    }
    var icon=categoriaIcon(nome, cat);
    if(img.id==='modal-img'){ img.style.display='none'; return; }
    if(img.classList.contains('product-img')||img.classList.contains('g-produto-img')){
      var ph=document.createElement('div');
      ph.className='product-img-placeholder';
      ph.textContent=icon;
      ph.setAttribute('aria-hidden','true');
      img.replaceWith(ph);
      return;
    }
    var style=img.getAttribute('style')||'';
    if(style.indexOf('50px')!==-1 || img.style.width==='50px'){
      var d=document.createElement('div');
      d.style.cssText='width:50px;height:50px;border-radius:6px;background:var(--color-bg-alt, #f3f4f6);display:flex;align-items:center;justify-content:center;font-size:22px';
      d.textContent=icon;
      img.replaceWith(d);
      return;
    }
    if(style.indexOf('100%')!==-1){
      var e=document.createElement('div');
      e.style.cssText=style+';display:flex;align-items:center;justify-content:center;font-size:28px;background:var(--color-bg-alt,#f3f4f6)';
      e.textContent=icon;
      img.replaceWith(e);
      return;
    }
    img.style.display='none';
  }
  window.categoriaIcon=categoriaIcon;
  window.placeholderForImg=placeholderFor;
  document.addEventListener('error',function(e){
    var t=e.target;
    if(t && t.tagName==='IMG'){ placeholderFor(t); }
  },true);
  window.handleImgError=function(img){ placeholderFor(img); };
})();
