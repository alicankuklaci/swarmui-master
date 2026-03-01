# SwarmUI — Docker Swarm Entegrasyonu (SaaS / Multi‑Tenant)

Bu doküman, SwarmUI'yi **SaaS** olarak işletirken **birden fazla müşteri cluster’ını** (Docker Swarm) güvenli şekilde bağlamayı açıklar.

## ✅ Önerilen Mimari: Agent (Outbound)

**Neden?**
- Müşteri tarafında inbound port açmak gerekmez
- NAT/Firewall arkasındaki node’lar bağlanabilir
- SaaS çoklu tenant için en güvenli model

### 1) SwarmUI SaaS (Merkez)
- SwarmUI server + Mongo + Redis
- Müşteri cluster’larını **agent token** ile doğrular
- Her agent bir **Tenant + Cluster** ile eşleşir

### 2) Müşteri Tarafı (Agent)
Her müşteri cluster’ında **Agent** container’ı çalışır.
Agent, SwarmUI merkezine **outbound** bağlanır.

```
Customer Swarm
  └─ swarmui-agent (outbound → SwarmUI SaaS)
```

---

## 🧭 Multi‑Tenant Model

**DB şeması yaklaşımı:**
- `tenants` koleksiyonu
- `endpoints` koleksiyonunda `tenantId`
- `users` koleksiyonunda `tenantId`
- RBAC tenant bazlı işler

**API tarafı:**
- JWT içinde `tenantId`
- Her request’te tenant scope enforced

---

## 🔐 Agent Kayıt Akışı (Öneri)

1. Admin panel → Yeni Tenant oluştur
2. Tenant için **Agent Token** üret
3. Müşteriye **Agent kurulum komutu** ver
4. Agent, SwarmUI’ye bağlanınca endpoint otomatik kaydolur

---

## 🐳 Agent Kurulum (Müşteri Node)

> Bu komut müşterinin Swarm Manager node’unda çalıştırılır.

```bash
# .env örneği
SWARMUI_URL=https://saas.yourdomain.com
AGENT_TOKEN=tenant_XXXX_agent_token

# Docker ile
docker run -d \
  --name swarmui-agent \
  --restart unless-stopped \
  -e SWARMUI_URL=$SWARMUI_URL \
  -e AGENT_TOKEN=$AGENT_TOKEN \
  -v /var/run/docker.sock:/var/run/docker.sock \
  swarmui/agent:latest
```

> Swarm mode için:

```bash
docker service create \
  --name swarmui-agent \
  --mode global \
  --mount type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock \
  --env SWARMUI_URL=$SWARMUI_URL \
  --env AGENT_TOKEN=$AGENT_TOKEN \
  swarmui/agent:latest
```

---

## 🧩 Alternatif: Direct Docker API (ÖNERİLMEZ)

- Docker API açılır: `2375/2376`
- TLS + IP allowlist gerekir
- Firewall / NAT yönetimi çok zor

SaaS için **riskli ve bakım maliyeti yüksek**.

---

## ✅ Sonuç

**SaaS + Multi‑Tenant için en mantıklı çözüm:**
✅ **Agent yaklaşımı**

İstersen bir sonraki adımda **agent servisinin** (Go/NestJS) taslağını çıkarırım.
