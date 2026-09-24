const CACHE='cozinha-immortals-v11';
const ASSETS=[
  './manifest.webmanifest',
  './immortals-logo.jpg',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;

  // HTML/navegação: tenta sempre a versão online primeiro.
  if(req.mode==='navigate'){
    event.respondWith(
      fetch(req,{cache:'no-store'})
        .then(res=>{
          const copy=res.clone();
          caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
          return res;
        })
        .catch(()=>caches.match('./index.html').then(r=>r||caches.match('./')))
    );
    return;
  }

  // Assets: cache com atualização em segundo plano.
  event.respondWith(
    caches.match(req).then(cached=>{
      const network=fetch(req).then(res=>{
        if(res && res.ok){
          const copy=res.clone();
          caches.open(CACHE).then(cache=>cache.put(req,copy));
        }
        return res;
      }).catch(()=>cached);
      return cached||network;
    })
  );
});
