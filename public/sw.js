const CURRENT='campuscrew-shell-v1';
self.addEventListener('install',event=>{event.waitUntil(caches.open(CURRENT).then(cache=>cache.add('/offline.html')));});
self.addEventListener('activate',event=>{event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('campuscrew-shell-')&&key!==CURRENT).map(key=>caches.delete(key)))),self.clients.claim()]));});
// Never cache authenticated pages, APIs, wallet data or payment status.
self.addEventListener('fetch',event=>{if(event.request.mode==='navigate'&&new URL(event.request.url).origin===self.location.origin){event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));}});
self.addEventListener('push',event=>{let data;try{data=event.data.json();}catch{return;}const url=new URL(data.url||'/me/notifications',self.location.origin);if(url.origin!==self.location.origin)return;event.waitUntil(self.registration.showNotification(data.title||'CampusCrew',{body:data.body||'Your activity has an update.',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:data.id||'campuscrew',data:{url:url.href}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=new URL(event.notification.data?.url||'/me/notifications',self.location.origin);if(url.origin!==self.location.origin)return;event.waitUntil(clients.openWindow(url.href));});
