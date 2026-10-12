// ============================================
// MAX REPRESENTAÇÃO — MINI SITE
// script.js v1.0
// ============================================

// ---- CONFIG ---- //
const API_BASE = "https://max-representacao-api.maxprimefotovideo.workers.dev";
const WHATSAPP_NUMERO = "5537991021468"; // (37) 9.9102-1468
const WHATSAPP_MSG_PADRAO = "Olá! Vi o catálogo no site e gostaria de mais informações.";

// ---- ESTADO ---- //
let produtosCache = [];
let temaAtual = "escuro"; // 'escuro' | 'claro'

// ============================================
// TEMA — CLARO / ESCURO
// ============================================
function getTemaSalvo() {
  return localStorage.getItem("max_site_tema") || "escuro";
}

function setTema(tema) {
  temaAtual = tema;
  localStorage.setItem("max_site_tema", tema);
  aplicarTema();
}

function aplicarTema() {
  document.body.classList.remove("tema-claro", "tema-escuro");
  document.body.classList.add("tema-" + temaAtual);

  const icone = document.getElementById("temaIcone");
  if (icone) {
    icone.className = temaAtual === "claro" ? "fas fa-sun" : "fas fa-moon";
  }
}

function alternarTema() {
  setTema(temaAtual === "escuro" ? "claro" : "escuro");
}

// ============================================
// TOAST DE BOAS-VINDAS (só na 1ª visita)
// ============================================
function mostrarBoasVindas() {
  const jaVisitou = localStorage.getItem("max_site_visitou");
  if (jaVisitou) return;

  // Espera 3s pra página carregar
  setTimeout(() => {
    const el = document.getElementById("boasVindas");
    if (el) el.classList.add("show");
  }, 3000);

  localStorage.setItem("max_site_visitou", "1");
}

function fecharBoasVindas() {
  const el = document.getElementById("boasVindas");
  if (el) el.classList.remove("show");
}

// ============================================
// BUSCAR PRODUTOS DA API
// ============================================
async function carregarProdutos() {
  const grid = document.getElementById("gridProdutos");
  const vazioWrap = document.getElementById("vazioWrap");
  const erroWrap = document.getElementById("erroWrap");
  const contador = document.getElementById("catalogoContador");

  // Estado de loading
  grid.innerHTML = `
    <div class="loader-wrap">
      <div class="loader"></div>
      <p class="loader-txt">Carregando produtos...</p>
    </div>
  `;
  vazioWrap.style.display = "none";
  erroWrap.style.display = "none";
  contador.textContent = "Carregando...";

  try {
    const res = await fetch(API_BASE + "/publico/produtos");
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || "Erro ao buscar produtos");
    }

    produtosCache = data.produtos || [];

    if (produtosCache.length === 0) {
      grid.innerHTML = "";
      vazioWrap.style.display = "block";
      contador.textContent = "0 produtos";
      return;
    }

    renderizarProdutos();
    contador.textContent = produtosCache.length + (produtosCache.length === 1 ? " produto" : " produtos");

  } catch (e) {
    console.error("[carregarProdutos]", e);
    grid.innerHTML = "";
    document.getElementById("erroTexto").textContent = e.message || "Erro ao carregar produtos.";
    erroWrap.style.display = "block";
    contador.textContent = "—";
  }
}

// ============================================
// RENDERIZAR CARDS DE PRODUTO
// ============================================
function renderizarProdutos() {
  const grid = document.getElementById("gridProdutos");
  grid.innerHTML = "";

  for (const p of produtosCache) {
    const card = document.createElement("article");
    card.className = "card-produto";

    // Badge de estoque (verde = normal, amarelo = baixo)
    const estoque = p.estoque_total || 0;
    const badgeClasse = estoque <= 5 ? "baixo" : "";
    const badgeTexto = estoque === 1 ? "1 par" : estoque + " pares";

    // Foto
    const fotoHTML = p.foto_url
      ? `<img src="${p.foto_url}" alt="${escapeHtml(p.modelo)} — ${escapeHtml(p.cor)}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=&quot;card-foto-vazio&quot;><i class=&quot;fas fa-image&quot;></i></div>'">`
      : `<div class="card-foto-vazio"><i class="fas fa-image"></i></div>`;

    card.innerHTML = `
      <div class="card-foto">
        <span class="card-badge-estoque ${badgeClasse}">
          <i class="fas fa-check-circle"></i> ${badgeTexto}
        </span>
        ${fotoHTML}
      </div>
      <div class="card-info">
        <h3 class="card-modelo">${escapeHtml(p.modelo)}</h3>
        <p class="card-cor">${escapeHtml(p.cor)}</p>
        <div class="card-rodape">
          <div class="card-preco">
            <span class="lbl">Atacado</span>
            <span class="val">Sob consulta</span>
          </div>
          <button class="card-btn" data-id="${p.id}">
            <i class="fab fa-whatsapp"></i> Consultar
          </button>
        </div>
      </div>
    `;

    // Clique no card abre modal
    card.addEventListener("click", (e) => {
      if (e.target.closest(".card-btn")) return; // se clicou no botão, não abre modal
      abrirModalProduto(p.id);
    });

    // Clique no botão abre WhatsApp direto
    const btn = card.querySelector(".card-btn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      consultarProdutoWhatsApp(p);
    });

    grid.appendChild(card);
  }
}

// ============================================
// WHATSAPP — CONSULTAR PRODUTO
// ============================================
function consultarProdutoWhatsApp(produto) {
  const msg = `Olá! Tenho interesse neste produto:\n\n*${produto.modelo} — ${produto.cor}*\nCódigo: ${produto.codigo_barras || "—"}\n\nPoderia me passar as grades e valores?`;
  abrirWhatsApp(msg);
}

function abrirWhatsApp(mensagem) {
  const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, "_blank");
}

// ============================================
// MODAL DE PRODUTO
// ============================================
function abrirModalProduto(id) {
  const p = produtosCache.find(x => x.id === id);
  if (!p) return;

  const modal = document.getElementById("modalProduto");
  const conteudo = document.getElementById("modalConteudo");

  const fotoHTML = p.foto_url
    ? `<img src="${p.foto_url}" alt="${escapeHtml(p.modelo)}" onerror="this.parentNode.innerHTML='<div class=&quot;modal-foto-vazio&quot;><i class=&quot;fas fa-image&quot;></i></div>'">`
    : `<div class="modal-foto-vazio"><i class="fas fa-image"></i></div>`;

  conteudo.innerHTML = `
    <div class="modal-foto">${fotoHTML}</div>
    <div class="modal-info">
      <span class="modal-tag">
        <i class="fas fa-check-circle"></i> Disponível
      </span>
      <h2 class="modal-modelo">${escapeHtml(p.modelo)}</h2>
      <p class="modal-cor">${escapeHtml(p.cor)}</p>

      <div class="modal-divisor"></div>

      <div class="modal-linha">
        <span class="lbl">Código</span>
        <span class="val">${escapeHtml(p.codigo_barras || "—")}</span>
      </div>
      <div class="modal-linha">
        <span class="lbl">Estoque</span>
        <span class="val verde">${p.estoque_total} pares</span>
      </div>
      <div class="modal-linha">
        <span class="lbl">Preço atacado</span>
        <span class="val roxo">Sob consulta</span>
      </div>

      <button class="modal-btn-whats" id="modalBtnWhats">
        <i class="fab fa-whatsapp"></i> Consultar no WhatsApp
      </button>

      <p class="modal-aviso">
        <i class="fas fa-info-circle"></i>
        Informe as grades e numerações desejadas na conversa.
      </p>
    </div>
  `;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Handler do botão WhatsApp dentro do modal
  const btnWhats = document.getElementById("modalBtnWhats");
  if (btnWhats) {
    btnWhats.addEventListener("click", () => consultarProdutoWhatsApp(p));
  }
}

function fecharModalProduto() {
  const modal = document.getElementById("modalProduto");
  modal.classList.remove("active");
  document.body.style.overflow = "";
}

// ============================================
// HELPERS
// ============================================
function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  // 1. Aplica tema salvo
  temaAtual = getTemaSalvo();
  aplicarTema();

  // 2. Preenche ano no footer
  const anoEl = document.getElementById("anoAtual");
  if (anoEl) anoEl.textContent = new Date().getFullYear();

  // 3. Toggle de tema
  const btnTema = document.getElementById("temaToggle");
  if (btnTema) btnTema.addEventListener("click", alternarTema);

  // 4. Botões WhatsApp (flutuante + footer)
  const whatsFloat = document.getElementById("whatsFloat");
  const footerWhats = document.getElementById("footerWhats");
  const msgPadrao = WHATSAPP_MSG_PADRAO;
  if (whatsFloat) whatsFloat.href = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msgPadrao)}`;
  if (footerWhats) footerWhats.href = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msgPadrao)}`;

  // 5. Botão de recarregar
  const btnRec = document.getElementById("btnRecarregar");
  if (btnRec) btnRec.addEventListener("click", carregarProdutos);

  // 6. Fechar toast de boas-vindas
  const btnFecharBv = document.getElementById("boasVindasFechar");
  if (btnFecharBv) btnFecharBv.addEventListener("click", fecharBoasVindas);

  // 7. Fechar modal
  const modalFechar = document.getElementById("modalFechar");
  if (modalFechar) modalFechar.addEventListener("click", fecharModalProduto);

  const modal = document.getElementById("modalProduto");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) fecharModalProduto();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModalProduto();
  });

  // 8. Carrega produtos
  carregarProdutos();

  // 9. Boas-vindas (só na 1ª visita)
  mostrarBoasVindas();
});
