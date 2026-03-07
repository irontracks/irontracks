Para acessar pelo iPhone (na mesma rede Wi-Fi), use um destes links:

*   **http://192.168.100.2:3000**
*   Ou: **http://192.168.100.3:3000**

---

**⚠️ Importante:**
Para que o Dashboard funcione no iPhone (e no computador), **preciso corrigir aquele erro que encontrei nos logs** (incompatibilidade com Next.js 15). Sem isso, a página pode dar erro 500 ou ficar branca ao tentar abrir.

**Posso aplicar a correção rápida no arquivo `dashboard/page.tsx` agora?**
(É apenas adicionar um `await` que faltou na atualização da versão).