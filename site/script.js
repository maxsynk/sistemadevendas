// ============================================
// MAX REPRESENTAÇÃO — MINI SITE v2.0
// script.js
// ============================================

const API_BASE = "https://max-representacao-api.maxprimefotovideo.workers.dev";
const WHATSAPP_NUMERO = "5537991021468";
const WHATSAPP_MSG_PADRAO = "Olá! Vi o catálogo no site e gostaria de mais informações.";
const MINIMO_PARES = 8;

let produtosCache = [];
let temaAtual = "escuro";
let carrinho = []; // { produto_id, variacao_id, numeracao, modelo, cor, foto_url, preco, qtd, estoque_disp }

// ============================================
// TEMA
// ============================================
function getTemaSalvo() { return localStorage.getItem("max_site_tema") || "escuro"; }
function setTema(t) { temaAtual = t; localStorage.setItem("max_site_tema", t); aplicarTema(); }
function aplicarTema() {
  document.body.classList.remove("tema-claro", "tema-escuro");
  document.body.classList.add("tema-" + temaAtual);
  const icone = document.getElementById("temaIcone");
  if (icone) icone.className = temaAtual === "claro" ? "fas fa-sun" : "fas fa-moon";
}
function alternarTema() { setTema(temaAtual === "escuro" ? "claro" : "escuro"); }

// ============================================
// TOAST BOAS-VINDAS (sempre que entra)
// ============================================
function mostrarBoasVindas() {
  setTimeout(() => {
    const el = document.getElementById("boasVindas");
    if (el) el.classList.add("show");
  }, 1500);
}
function fecharBoasVindas() {
  const el = document.getElementById("boasVindas");
  if (el) el.classList.remove("show");
}

// ============================================
// CARREGAR PRODUTOS
// ============================================
async function carregarProdutos() {
  const grid = document.getElementById("gridProdutos");
  const vazioWrap = document.getElementById("vazioWrap");
  const erroWrap = document.getElementById("erroWrap");
  const contador = document.getElementById("catalogoContador");

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
    if (!data.success) throw new Error(data.error || "Erro ao buscar produtos");

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
// RENDERIZAR CARDS
// ============================================
function renderizarProdutos() {
  const grid = document.getElementById("gridProdutos");
  grid.innerHTML = "";

  for (const p of produtosCache) {
    const card = document.createElement("article");
    card.className = "card-produto";

    const fotoHTML = p.foto_url
      ? `<img src="${p.foto_url}" alt="${escapeHtml(p.modelo)}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=&quot;card-foto-vazio&quot;><i class=&quot;fas fa-image&quot;></i></div>'">`
      : `<div class="card-foto-vazio"><i class="fas fa-image"></i></div>`;

    const gradeHTML = (p.grade || []).map(g => {
      const disp = g.disponivel || 0;
      const cls = disp > 0 ? "" : "zero";
      return `<span class="grade-num ${cls}">${g.numeracao}${disp > 0 ? `·${disp}` : ""}</span>`;
    }).join("");

    card.innerHTML = `
      <div class="card-foto">${fotoHTML}</div>
      <div class="card-info">
        <h3 class="card-modelo">${escapeHtml(p.modelo)}</h3>
        <p class="card-cor">${escapeHtml(p.cor)}</p>
        <p class="card-codigo">${escapeHtml(p.codigo_barras || "")}</p>
        <p class="card-grade-label">Numeração disponível</p>
        <div class="card-grade">${gradeHTML}</div>
        <div class="card-rodape">
          <div class="card-preco">
            <span class="lbl">Preço do par</span>
            <span class="val">${formatarMoeda(p.preco_venda_atacado)}</span>
          </div>
          <button class="card-btn" data-id="${p.id}">
            <i class="fas fa-shopping-bag"></i> Escolher numeração
          </button>
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest(".card-btn")) return;
      abrirModalProduto(p.id);
    });
    const btn = card.querySelector(".card-btn");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModalProduto(p.id);
    });

    grid.appendChild(card);
  }
}

// ============================================
// MODAL PRODUTO
// ============================================
function abrirModalProduto(id) {
  const p = produtosCache.find(x => x.id === id);
  if (!p) return;

  const modal = document.getElementById("modalProduto");
  const conteudo = document.getElementById("modalConteudo");

  const fotoHTML = p.foto_url
    ? `<img src="${p.foto_url}" alt="${escapeHtml(p.modelo)}" onerror="this.parentNode.innerHTML='<div class=&quot;modal-foto-vazio&quot;><i class=&quot;fas fa-image&quot;></i></div>'">`
    : `<div class="modal-foto-vazio"><i class="fas fa-image"></i></div>`;

  // Grade com input de quantidade (só numerações com estoque > 0)
  const disponiveis = (p.grade || []).filter(g => g.disponivel > 0);
  const gradeHTML = disponiveis.map(g => `
    <div class="grade-item">
      <span class="num">${g.numeracao}</span>
      <input type="number" class="qtd-input" data-num="${g.numeracao}" data-disp="${g.disponivel}" min="0" max="${g.disponivel}" placeholder="0">
      <span class="disp">${g.disponivel} disp</span>
    </div>
  `).join("") || `<p style="color:var(--text-dim);font-size:13px">Nenhuma numeração disponível</p>`;

  conteudo.innerHTML = `
    <div class="modal-foto">${fotoHTML}</div>
    <div class="modal-info">
      <span class="modal-tag"><i class="fas fa-check-circle"></i> Disponível</span>
      <h2 class="modal-modelo">${escapeHtml(p.modelo)}</h2>
      <p class="modal-cor">${escapeHtml(p.cor)}</p>
      <p class="modal-codigo">${escapeHtml(p.codigo_barras || "")}</p>

      <div class="modal-preco">
        <div>
          <span class="lbl">Preço do par</span>
          <span class="val">${formatarMoeda(p.preco_venda_atacado)}</span>
          <span class="un">/par</span>
        </div>
      </div>

      <div class="modal-divisor"></div>

      <p class="modal-secao-titulo">
        <i class="fas fa-shoe-prints"></i> Escolha as numerações e quantidades
      </p>
      <div class="modal-grade" id="modalGrade">${gradeHTML}</div>

      <button class="modal-add-btn" id="modalAddBtn" disabled>
        <i class="fas fa-cart-plus"></i> Adicionar ao carrinho
      </button>
    </div>
  `;

  modal.classList.add("active");
  document.body.style.overflow = "hidden";

  // Listeners dos inputs
  const inputs = conteudo.querySelectorAll(".qtd-input");
  const btnAdd = document.getElementById("modalAddBtn");
  const atualizarBtn = () => {
    const temAlgo = Array.from(inputs).some(inp => (parseInt(inp.value) || 0) > 0);
    btnAdd.disabled = !temAlgo;
  };
  inputs.forEach(inp => {
    inp.addEventListener("input", () => {
      let v = parseInt(inp.value) || 0;
      const max = parseInt(inp.dataset.disp);
      if (v < 0) v = 0;
      if (v > max) { v = max; inp.value = max; }
      atualizarBtn();
    });
  });

  // Botão adicionar
  btnAdd.addEventListener("click", () => {
    let totalAdicionados = 0;
    inputs.forEach(inp => {
      const q = parseInt(inp.value) || 0;
      if (q > 0) {
        carrinho.push({
          produto_id: p.id,
          modelo: p.modelo,
          cor: p.cor,
          foto_url: p.foto_url,
          preco: parseFloat(p.preco_venda_atacado) || 0,
          numeracao: parseInt(inp.dataset.num),
          qtd: q,
        });
        totalAdicionados += q;
      }
    });
    if (totalAdicionados > 0) {
      atualizarCarrinho();
      fecharModalProduto();
      abrirModalCarrinho();
    }
  });
}

function fecharModalProduto() {
  document.getElementById("modalProduto").classList.remove("active");
  document.body.style.overflow = "";
}

// ============================================
// CARRINHO
// ============================================
function atualizarCarrinho() {
  const totalItens = carrinho.reduce((s, c) => s + c.qtd, 0);
  const badge = document.getElementById("carrinhoBadge");
  const floatBtn = document.getElementById("carrinhoFloat");
  badge.textContent = totalItens;
  floatBtn.style.display = totalItens > 0 ? "flex" : "none";
}

function abrirModalCarrinho() {
  const modal = document.getElementById("modalCarrinho");
  const lista = document.getElementById("carrinhoLista");
  const rodape = document.getElementById("carrinhoRodape");
  const aviso = document.getElementById("carrinhoAviso");
  const btnEnviar = document.getElementById("carrinhoEnviar");

  if (carrinho.length === 0) {
    lista.innerHTML = `
      <div class="carrinho-vazio">
        <i class="fas fa-shopping-bag"></i>
        <p>Seu carrinho está vazio</p>
      </div>
    `;
    rodape.style.display = "none";
    modal.classList.add("active");
    document.body.style.overflow = "hidden";
    return;
  }

  rodape.style.display = "block";
  lista.innerHTML = carrinho.map((it, i) => `
    <div class="carrinho-item">
      <div class="carrinho-foto">
        ${it.foto_url ? `<img src="${it.foto_url}" alt="">` : `<i class="fas fa-image"></i>`}
      </div>
      <div class="carrinho-info">
        <div class="nome">${escapeHtml(it.modelo)} — ${escapeHtml(it.cor)}</div>
        <div class="det">Nº <b>${it.numeracao}</b> · ${it.qtd} ${it.qtd === 1 ? "par" : "pares"}</div>
        <div class="det">${formatarMoeda(it.preco)} /par</div>
      </div>
      <button class="carrinho-remover" data-idx="${i}" aria-label="Remover">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join("");

  // Listeners remover
  lista.querySelectorAll(".carrinho-remover").forEach(btn => {
    btn.addEventListener("click", () => {
      carrinho.splice(parseInt(btn.dataset.idx), 1);
      atualizarCarrinho();
      abrirModalCarrinho();
    });
  });

  const totalPares = carrinho.reduce((s, c) => s + c.qtd, 0);
  const totalValor = carrinho.reduce((s, c) => s + c.qtd * c.preco, 0);
  document.getElementById("carrinhoTotalPares").textContent = totalPares;
  document.getElementById("carrinhoTotalValor").textContent = formatarMoeda(totalValor);

  // Aviso de mínimo
  if (totalPares < MINIMO_PARES) {
    aviso.classList.add("show");
    aviso.innerHTML = `<i class="fas fa-info-circle"></i> Pedido mínimo: ${MINIMO_PARES} pares. Faltam ${MINIMO_PARES - totalPares}.`;
    btnEnviar.disabled = true;
  } else {
    aviso.classList.remove("show");
    btnEnviar.disabled = false;
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function fecharModalCarrinho() {
  document.getElementById("modalCarrinho").classList.remove("active");
  document.body.style.overflow = "";
}

function limparCarrinho() {
  if (!confirm("Limpar todo o carrinho?")) return;
  carrinho = [];
  atualizarCarrinho();
  fecharModalCarrinho();
}

// ============================================
// ENVIAR PEDIDO VIA WHATSAPP
// ============================================
function enviarPedidoWhatsApp() {
  if (carrinho.length === 0) return;

  // Agrupa por produto
  const porProduto = {};
  for (const it of carrinho) {
    const key = it.produto_id;
    if (!porProduto[key]) {
      porProduto[key] = { modelo: it.modelo, cor: it.cor, itens: [] };
    }
    porProduto[key].itens.push(it);
  }

  let msg = `*NOVO PEDIDO — Site MAX Representação*\n\n`;

  let totalPares = 0;
  let totalValor = 0;

  for (const key in porProduto) {
    const p = porProduto[key];
    msg += `*${p.modelo} — ${p.cor}*\n`;
    for (const it of p.itens) {
      msg += `  • Nº ${it.numeracao}: ${it.qtd} ${it.qtd === 1 ? "par" : "pares"}\n`;
      totalPares += it.qtd;
      totalValor += it.qtd * it.preco;
    }
    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━\n`;
  msg += `*Total: ${totalPares} pares*\n`;
  msg += `*Valor estimado: ${formatarMoeda(totalValor)}*\n\n`;
  msg += `Aguardo instruções para fechamento do pedido.`;

  abrirWhatsApp(msg);
  fecharModalCarrinho();
}

// ============================================
// WHATSAPP (Desktop first, fallback web)
// ============================================
function abrirWhatsApp(mensagem) {
  const texto = encodeURIComponent(mensagem);
  const urlApp = `whatsapp://send?phone=${WHATSAPP_NUMERO}&text=${texto}`;
  const urlWeb = `https://wa.me/${WHATSAPP_NUMERO}?text=${texto}`;

  // Tenta abrir o app (desktop/mobile)
  // Se em 1.5s a página ainda estiver visível, cai pro web
  let foiParaApp = false;
  const t = setTimeout(() => {
    if (!foiParaApp && !document.hidden) {
      window.open(urlWeb, "_blank");
    }
  }, 1500);

  window.addEventListener("blur", () => { foiParaApp = true; clearTimeout(t); }, { once: true });
  window.location.href = urlApp;
}

// ============================================
// HELPERS
// ============================================
function formatarMoeda(v) {
  return "R$ " + (parseFloat(v) || 0).toFixed(2).replace(".", ",");
}
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
  temaAtual = getTemaSalvo();
  aplicarTema();

  const anoEl = document.getElementById("anoAtual");
  if (anoEl) anoEl.textContent = new Date().getFullYear();

  document.getElementById("temaToggle").addEventListener("click", alternarTema);

  // WhatsApp flutuante + footer
  const msgPadrao = WHATSAPP_MSG_PADRAO;
  document.getElementById("whatsFloat").href = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msgPadrao)}`;
  document.getElementById("footerWhats").href = `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msgPadrao)}`;

  document.getElementById("btnRecarregar").addEventListener("click", carregarProdutos);
  document.getElementById("boasVindasFechar").addEventListener("click", fecharBoasVindas);

  // Modal produto
  document.getElementById("modalFechar").addEventListener("click", fecharModalProduto);
  document.getElementById("modalProduto").addEventListener("click", (e) => {
    if (e.target.id === "modalProduto") fecharModalProduto();
  });

  // Carrinho
  document.getElementById("carrinhoFloat").addEventListener("click", abrirModalCarrinho);
  document.getElementById("modalCarrinhoFechar").addEventListener("click", fecharModalCarrinho);
  document.getElementById("modalCarrinho").addEventListener("click", (e) => {
    if (e.target.id === "modalCarrinho") fecharModalCarrinho();
  });
  document.getElementById("carrinhoLimpar").addEventListener("click", limparCarrinho);
  document.getElementById("carrinhoEnviar").addEventListener("click", enviarPedidoWhatsApp);

  // ESC fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharModalProduto();
      fecharModalCarrinho();
    }
  });

  carregarProdutos();
  mostrarBoasVindas();
});
