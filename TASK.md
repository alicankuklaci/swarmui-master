SwarmUI Master projesine 10 yeni ozellik ekle, her birini test et, build et, deploy et.

Calisma dizini: /home/nlc/projects/swarmui
Backend: apps/backend/src/
Frontend: apps/frontend/src/
Docker Hub: alicankuklaci/swarmui-master-backend:latest ve alicankuklaci/swarmui-master-frontend:latest
SSH deploy: sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111
pnpm kullan, TypeScript hatalarini coz.

--- OZELLIK 1: Docker Event Log sayfasi ---

Backend: apps/backend/src/modules/ altinda events modul olustur.
- events.controller.ts: GET /endpoints/:endpointId/events - docker.getEvents({}) ile son 100 eventi al, SSE stream destegi de ekle
- events.service.ts: listEvents(endpointId, filters?) - docker.listContainers gibi docker.getEvents ile

Frontend: src/pages/EventsPage.tsx olustur
- Sol sidebar'a "Events" menusu ekle (App.tsx veya router'da)
- Tablo: Time | Type | Action | Actor | From
- Canli stream: SSE ile auto-update
- Filtre: container/image/network/volume type filtresi
- Renk: start=yesil, stop=kirmizi, die=kirmizi, create=mavi, destroy=turuncu

--- OZELLIK 2: Node Drain/Active/Pause ---

Backend: apps/backend/src/modules/swarm/ altindaki nodes service/controller'a ekle
- PATCH /endpoints/:endpointId/swarm/nodes/:id - body: {availability: "drain"|"active"|"pause"}
- docker.getNode(id).update({...spec, Availability: availability})

Frontend: NodesPage.tsx'e ekle
- Her node satirinda Availability dropdown veya 3 buton: Active / Drain / Pause
- Renk: active=yesil, drain=sari, pause=gri
- Onay modal'i: "Bu node'u drain moduna almak istiyor musunuz? Uzerindeki containerlar diger node'lara tasinacak."

--- OZELLIK 3: Network Container Listesi ---

Backend: networks.service.ts'e ekle
- GET /endpoints/:endpointId/networks/:id/containers - docker.getNetwork(id).inspect() icindeki Containers field
- Her container icin: id, name, IPv4, Mac adresi

Frontend: NetworksPage.tsx veya NetworkDetailPage.tsx (yeni olustur)
- Network satirina "Details" butonu
- Detail modal/sayfasi: Network bilgileri + bagli container listesi tablosu
- Sutunlar: Container Name | IPv4 | MAC | Joined

--- OZELLIK 4: Container Resource Limits ---

Backend: containers.service.ts'e ekle
- PATCH /endpoints/:endpointId/containers/:id/resources - body: {memory, cpuQuota, cpuShares}
- container.update({Memory: memory, CpuQuota: cpuQuota, CpuShares: cpuShares})

Frontend: ContainerDetailPage.tsx'e ekle
- Inspect tab altina veya ayri "Resources" tab
- Form: Memory Limit (MB), CPU Quota (0=unlimited), CPU Shares
- Mevcut degerleri doldur, Save butonu
- Basit validasyon: memory >= 0, cpuQuota 0-100000 arasi

--- OZELLIK 5: Service Update Policy UI ---

Backend: swarm/services icine ekle
- PATCH /endpoints/:endpointId/swarm/services/:id/update-policy
- body: {parallelism, delay, failureAction, order}
- docker.getService(id).inspect() alip spec'e UpdateConfig ekleyerek update

Frontend: ServiceDetailPage.tsx'e ekle
- "Update Policy" bolumu veya tab
- Form alanlari:
  * Parallelism (kac container ayni anda guncellenir, default 1)
  * Update Delay (saniye, default 0)
  * Failure Action: pause/continue/rollback
  * Update Order: stop-first/start-first
- "Force Redeploy" butonu da ekle (service.update ile image'i force guncelle)

--- OZELLIK 6: Log Export (CSV/JSON) ---

Backend: activity-logs ve auth-logs controller'larina ekle
- GET /logs/activity?export=csv - CSV formatinda don
- GET /logs/auth?export=csv - CSV formatinda don
- CSV header: timestamp, user, action, resource, ip vb.

Frontend:
- ActivityLogsPage.tsx ve AuthLogsPage.tsx'e "Export CSV" ve "Export JSON" butonlari ekle
- window.open ile direkt download

--- OZELLIK 7: Volume File Browser ---

Backend: volumes.service.ts veya yeni endpoint
- GET /endpoints/:endpointId/volumes/:name/browse?path=/
  * Gecici alpine container olustur: docker.createContainer({Image:'alpine', Cmd:['ls','-la',path], HostConfig:{Binds:[volumeName+':/data']}})
  * Container'i calistir, ciktiyi al, container'i sil
  * Dosya listesini parse et: isim, tip(dir/file), boyut, tarih

Frontend: VolumesPage.tsx'e ekle
- Her volume satirina "Browse" butonu
- Modal/drawer: dosya agaci gorunumu
- Klasor: tiklayinca icini goster (path parametresi guncelle)
- Dosya: boyut ve tarih goster, download butonu (cat ile icerik al)

--- OZELLIK 8: Container Duplicate ---

Backend: containers.service.ts'e ekle
- POST /endpoints/:endpointId/containers/:id/duplicate
- Mevcut container'i inspect et, ayni config ile yeni container olustur
- Name'e "-copy" ekle, port conflict varsa bos birak

Frontend: ContainersPage.tsx ve ContainerDetailPage.tsx'e ekle
- Her container satirinda "Duplicate" butonu (copy icon)
- Onay modal: "Bu container'i kopyalamak istiyor musunuz? Yeni container: {name}-copy"
- Basari/hata toast mesaji

--- OZELLIK 9: Image Yeni Surum Badge ---

Backend: images.service.ts'e ekle
- GET /endpoints/:endpointId/images/:id/check-update
- Docker Hub API: GET https://hub.docker.com/v2/repositories/{user}/{repo}/tags/?page_size=1
- Mevcut image digest ile karsilastir
- {hasUpdate: boolean, latestDigest, currentDigest} don

Frontend: ImagesPage.tsx'e ekle
- Her image satirinda async olarak check-update cagir
- "Update Available" badge (sari/turuncu) goster
- Badge'e tiklaninca "docker pull image:tag" komutu goster
- Rate limit icin sadece ilk 10 image icin kontrol yap

--- OZELLIK 10: Backup S3 + Schedule ---

Backend: backup.service.ts'e ekle/duzelt
- Local backup: MongoDB dump (mongoexport) + tar.gz
  * exec ile mongodump calistir: docker exec mongo mongodump --archive > backup.tar.gz
  * /tmp/backups/ klasorune kaydet
- S3 upload: @aws-sdk/client-s3 kullan
  * pnpm add @aws-sdk/client-s3
  * PutObjectCommand ile upload
- Schedule: node-cron ile (pnpm add node-cron)
  * Settings'den cron expression al, backup at

Frontend: BackupPage.tsx'e duzelt/ekle
- "Create Backup Now" butonu - POST /backup/create
- Backup listesi: dosya adi, boyut, tarih, download, delete
- S3 Settings formu: bucket, region, accessKey, secretKey, prefix
- Schedule formu: cron expression (ornek: "0 2 * * *" = her gece 02:00)
- Download butonu: GET /backup/:filename/download

--- DEPLOYMENT ---

Her ozellikten sonra DEGIL, hepsini ekledikten sonra:

1. Backend build: cd /home/nlc/projects/swarmui/apps/backend && pnpm build
2. Frontend build: cd /home/nlc/projects/swarmui/apps/frontend && pnpm build
3. Hata varsa duzelt
4. Docker build:
   cd /home/nlc/projects/swarmui
   docker build --no-cache --target backend -t alicankuklaci/swarmui-master-backend:latest .
   docker build --no-cache --target frontend -t alicankuklaci/swarmui-master-frontend:latest .
5. Push:
   docker push alicankuklaci/swarmui-master-backend:latest
   docker push alicankuklaci/swarmui-master-frontend:latest
6. Deploy:
   sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111 "docker service update --force --image alicankuklaci/swarmui-master-backend:latest swarmui-master_backend && docker service update --force --image alicankuklaci/swarmui-master-frontend:latest swarmui-master_frontend"
7. Verify:
   sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111 "docker service ls"

--- TEST ---

Deploy sonrasi her ozellik icin API testi yap:

TEST 1 - Events:
sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111 "
BID=\$(docker ps --filter 'name=swarmui-master_backend' --format '{{.ID}}')
TOKEN=\$(docker exec \$BID wget -qO- --post-data='{\"username\":\"root\",\"password\":\"root\"}' --header='Content-Type: application/json' http://localhost:3001/api/v1/auth/login 2>/dev/null | grep -oP '\"accessToken\":\"[^\"]+\"' | cut -d'\"' -f4)
docker exec \$BID wget -qO- --header=\"Authorization: Bearer \$TOKEN\" 'http://localhost:3001/api/v1/endpoints/local/events?limit=5' 2>/dev/null | head -c 500
"

TEST 2 - Node update:
sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111 "
BID=\$(docker ps --filter 'name=swarmui-master_backend' --format '{{.ID}}')
TOKEN=\$(docker exec \$BID wget -qO- --post-data='{\"username\":\"root\",\"password\":\"root\"}' --header='Content-Type: application/json' http://localhost:3001/api/v1/auth/login 2>/dev/null | grep -oP '\"accessToken\":\"[^\"]+\"' | cut -d'\"' -f4)
NODE_ID=\$(docker node ls -q | head -1)
docker exec \$BID wget -qO- --header=\"Authorization: Bearer \$TOKEN\" 'http://localhost:3001/api/v1/endpoints/local/swarm/nodes' 2>/dev/null | head -c 300
"

TEST 3 - Network containers:
sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111 "
BID=\$(docker ps --filter 'name=swarmui-master_backend' --format '{{.ID}}')
TOKEN=\$(docker exec \$BID wget -qO- --post-data='{\"username\":\"root\",\"password\":\"root\"}' --header='Content-Type: application/json' http://localhost:3001/api/v1/auth/login 2>/dev/null | grep -oP '\"accessToken\":\"[^\"]+\"' | cut -d'\"' -f4)
NETID=\$(docker exec \$BID wget -qO- --header=\"Authorization: Bearer \$TOKEN\" 'http://localhost:3001/api/v1/endpoints/local/networks' 2>/dev/null | python3 -c \"import sys,json; nets=json.load(sys.stdin); print(nets.get('data',nets)[0].get('Id',''))\" 2>/dev/null)
docker exec \$BID wget -qO- --header=\"Authorization: Bearer \$TOKEN\" \"http://localhost:3001/api/v1/endpoints/local/networks/\$NETID/containers\" 2>/dev/null | head -c 500
"

TEST 4 - Container duplicate:
sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111 "
BID=\$(docker ps --filter 'name=swarmui-master_backend' --format '{{.ID}}')
TOKEN=\$(docker exec \$BID wget -qO- --post-data='{\"username\":\"root\",\"password\":\"root\"}' --header='Content-Type: application/json' http://localhost:3001/api/v1/auth/login 2>/dev/null | grep -oP '\"accessToken\":\"[^\"]+\"' | cut -d'\"' -f4)
CID=\$(docker ps --format '{{.ID}}' | tail -1)
docker exec \$BID wget -qO- --post-data='{}' --header=\"Authorization: Bearer \$TOKEN\" --header='Content-Type: application/json' \"http://localhost:3001/api/v1/endpoints/local/containers/\$CID/duplicate\" 2>/dev/null | head -c 300
"

TEST 5 - Backup create:
sshpass -p "254226Aq*" ssh -o StrictHostKeyChecking=no -p 2210 nlc@212.83.131.111 "
BID=\$(docker ps --filter 'name=swarmui-master_backend' --format '{{.ID}}')
TOKEN=\$(docker exec \$BID wget -qO- --post-data='{\"username\":\"root\",\"password\":\"root\"}' --header='Content-Type: application/json' http://localhost:3001/api/v1/auth/login 2>/dev/null | grep -oP '\"accessToken\":\"[^\"]+\"' | cut -d'\"' -f4)
docker exec \$BID wget -qO- --post-data='{}' --header=\"Authorization: Bearer \$TOKEN\" --header='Content-Type: application/json' 'http://localhost:3001/api/v1/backup/create' 2>/dev/null | head -c 300
"

Her test sonucunu yaz. Basarili mi basarisiz mi, neden.

Sonunda tum 10 ozelligin durumunu ozet tablo olarak yaz:
OZELLIK | BACKEND | FRONTEND | API TEST | DURUM
