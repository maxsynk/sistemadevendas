// ============================================
// MAX REPRESENTAÇÃO — SITE v4.6
// script.js
// v4.5: Auth por WhatsApp+senha; pedido em aberto; sessão em localStorage
// v4.6: Removida duplicação de variáveis e da função validarEstoqueCarrinho
// ============================================

const API_BASE = "https://max-representacao-api.maxprimefotovideo.workers.dev";
const ATENDENTES = [
  { nome: "Max", numero: "5537991021468" },
  { nome: "Suellen", numero: "5537991477086" }
];
const WHATSAPP_MSG_PADRAO = "Olá! Vi o catálogo no site e gostaria de mais informações.";
const MINIMO_PARES = 1; // Permite fechar pedido com 1 par
const MINIMO_ENVIO = 6; // Aviso: pedidos abaixo disso não são despachados

// ============================================
// PWA — Registra o service worker
// ============================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js")
      .then((reg) => console.log("[PWA Site] Service Worker registrado:", reg.scope))
      .catch((err) => console.error("[PWA Site] Erro ao registrar SW:", err));
  });
}

let produtosCache = [];
let categoriasMenu = [];
let categoriaAtualSlug = ""; // slug da categoria selecionada (vazio = Todos)
let temaAtual = "escuro";
let carrinho = [];
let deferredInstallPrompt = null;

// ============================================
// CARRINHO PERSISTENTE (localStorage)
// ============================================
const CARRINHO_STORAGE_KEY = "max_site_carrinho";

// Salva o carrinho atual no localStorage
function salvarCarrinhoLocal() {
  // Não salva se estiver em modo adição (pra não misturar)
  if (typeof modoAdicaoAtivo !== "undefined" && modoAdicaoAtivo) return;
  try {
    if (carrinho.length === 0) {
      localStorage.removeItem(CARRINHO_STORAGE_KEY);
    } else {
      localStorage.setItem(CARRINHO_STORAGE_KEY, JSON.stringify(carrinho));
    }
  } catch (e) {
    console.warn("[carrinho] Erro ao salvar:", e.message);
  }
}

// Recupera o carrinho do localStorage
function recuperarCarrinhoLocal() {
  try {
    const salvo = localStorage.getItem(CARRINHO_STORAGE_KEY);
    if (!salvo) return;
    const carrinhoSalvo = JSON.parse(salvo);
    if (!Array.isArray(carrinhoSalvo) || carrinhoSalvo.length === 0) return;

    // Recupera (com validação básica de cada item)
    carrinho = carrinhoSalvo.filter(it =>
      it &&
      it.produto_id &&
      it.numeracao &&
      typeof it.qtd === "number" &&
      it.qtd > 0
    );

    if (carrinho.length > 0) {
      const totalPares = carrinho.reduce((s, c) => s + c.qtd, 0);
      setTimeout(() => {
        mostrarToastAdd(`🛒 Carrinho recuperado: ${totalPares} ${totalPares === 1 ? "par" : "pares"}`);
      }, 2000);
    }
  } catch (e) {
    console.warn("[carrinho] Erro ao recuperar:", e.message);
    localStorage.removeItem(CARRINHO_STORAGE_KEY);
  }
}

// Limpa o carrinho do localStorage
function limparCarrinhoLocal() {
  try {
    localStorage.removeItem(CARRINHO_STORAGE_KEY);
  } catch (e) {}
}

// ============================================
// PWA — INSTALAÇÃO
// ============================================
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById("btnInstalar");
  if (btn) btn.style.display = "inline-flex";
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById("btnInstalar");
  if (btn) btn.style.display = "none";
});

async function instalarPWA() {
  if (!deferredInstallPrompt) {
    alert("Pra instalar: use o menu do navegador → 'Instalar app' ou 'Adicionar à tela inicial'");
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  console.log("[PWA] Escolha do usuário:", outcome);
  deferredInstallPrompt = null;
  const btn = document.getElementById("btnInstalar");
  if (btn) btn.style.display = "none";
}

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
// TOAST BOAS-VINDAS
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
// TOAST "ADICIONADO"
// ============================================
function mostrarToastAdd(msg) {
  const toast = document.getElementById("toastAdd");
  const txt = document.getElementById("toastAddTexto");
  if (!toast || !txt) return;
  txt.textContent = msg || "Adicionado ao carrinho!";
  toast.classList.add("show");
  clearTimeout(window.__toastAddTimer);
  window.__toastAddTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 1800);
}

// ============================================
// CARREGAR CATEGORIAS
// ============================================
async function carregarCategorias() {
  const barra = document.getElementById("catBar");
  const inner = document.getElementById("catBarInner");
  if (!barra || !inner) return;

  try {
    const res = await fetch(API_BASE + "/publico/categorias");
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Erro ao buscar categorias");

    categoriasMenu = data.menu || [];

    if (categoriasMenu.length === 0) {
      barra.classList.add("vazia");
      return;
    }

    barra.classList.remove("vazia");

    // Limpa e recria os chips (mantém "Todos" sempre primeiro)
    inner.innerHTML = `<button class="cat-chip active" data-cat-slug=""><i class="fas fa-th"></i> Todos</button>`;

    for (const c of categoriasMenu) {
      const btn = document.createElement("button");
      btn.className = "cat-chip";
      btn.dataset.catSlug = c.slug;
      btn.textContent = c.nome;
      btn.addEventListener("click", () => selecionarCategoria(c.slug, c.nome));
      inner.appendChild(btn);
    }

    // Re-bind do "Todos"
    const btnTodos = inner.querySelector('[data-cat-slug=""]');
    btnTodos.addEventListener("click", () => selecionarCategoria("", "Todos os Produtos"));
  } catch (e) {
    console.error("[carregarCategorias]", e);
    // Se falhar, esconde a barra
    barra.classList.add("vazia");
  }
}

// ============================================
// SELECIONAR CATEGORIA
// ============================================
function selecionarCategoria(slug, nome) {
  categoriaAtualSlug = slug;

  // Atualiza chip ativo
  document.querySelectorAll(".cat-chip").forEach(chip => {
    chip.classList.toggle("active", chip.dataset.catSlug === slug);
  });

  // Atualiza o título do catálogo
  const titulo = document.getElementById("catalogoTituloFiltro");
  if (titulo) titulo.textContent = nome || "Todos os Produtos";

  // Rola até o catálogo
  const catalogo = document.getElementById("produtos");
  if (catalogo) {
    const yOffset = -140; // compensa header + cat-bar
    const y = catalogo.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  // Recarrega produtos filtrados
  carregarProdutos();
}

// ============================================
// CARREGAR PRODUTOS
// ============================================
async function carregarProdutos() {
  const grid = document.getElementById("gridProdutos");
  const vazioWrap = document.getElementById("vazioWrap");
  const vazioCategoriaWrap = document.getElementById("vazioCategoriaWrap");
  const erroWrap = document.getElementById("erroWrap");
  const contador = document.getElementById("catalogoContador");

  grid.innerHTML = `
    <div class="loader-wrap">
      <div class="loader"></div>
      <p class="loader-txt">Carregando produtos...</p>
    </div>
  `;
  vazioWrap.style.display = "none";
  vazioCategoriaWrap.style.display = "none";
  erroWrap.style.display = "none";
  contador.textContent = "Carregando...";

  try {
    let url = API_BASE + "/publico/produtos";
    if (categoriaAtualSlug) url += "?categoria=" + encodeURIComponent(categoriaAtualSlug);

    const res = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Erro ao buscar produtos");

    produtosCache = data.produtos || [];

    if (produtosCache.length === 0) {
      grid.innerHTML = "";
      // Se tem categoria selecionada, mostra o vazio da categoria
      if (categoriaAtualSlug) {
        vazioCategoriaWrap.style.display = "block";
      } else {
        vazioWrap.style.display = "block";
      }
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
      return `<span class="grade-num ${cls}">${g.numeracao}</span>`;
    }).join("");

    // Badge NOVIDADE / REPOSIÇÃO
    let badgeHTML = "";
    if (p.badge === "novidade") {
      badgeHTML = `<div class="card-badge badge-novidade"><i class="fas fa-star"></i> NOVIDADE</div>`;
    } else if (p.badge === "reposicao") {
      badgeHTML = `<div class="card-badge badge-reposicao"><i class="fas fa-sync-alt"></i> REPOSIÇÃO</div>`;
    }

    card.innerHTML = `
      <div class="card-foto">
        ${badgeHTML}
        ${fotoHTML}
      </div>
      <div class="card-info">
        <h3 class="card-modelo">${escapeHtml(p.modelo)}</h3>
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
      mostrarToastAdd(`✅ ${totalAdicionados} ${totalAdicionados === 1 ? "par adicionado" : "pares adicionados"}!`);
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
  const badge = document.getElementById("headerCarrinhoBadge");
  if (badge) {
    badge.textContent = totalItens;
    badge.style.display = totalItens > 0 ? "flex" : "none";
  }
  // Salva no localStorage sempre que muda
  salvarCarrinhoLocal();
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
  
  // Renderiza os itens, incluindo a verificação de estoque em tempo real se já tiver sido feita
  lista.innerHTML = carrinho.map((it, i) => {
    const semEstoque = it.estoque_atual !== undefined && it.estoque_atual < it.qtd;
    const textoEstoque = semEstoque 
      ? `<div class="det" style="color:var(--error); font-weight:bold;"><i class="fas fa-exclamation-triangle"></i> Indisponível (Restam ${it.estoque_atual || 0})</div>` 
      : (it.estoque_atual !== undefined ? `<div class="det" style="color:var(--success)"><i class="fas fa-check"></i> Em estoque</div>` : "");

    return `
    <div class="carrinho-item" style="${semEstoque ? 'border: 1px solid var(--error); background: rgba(239,68,68,0.05);' : ''}">
      <div class="carrinho-foto">
        ${it.foto_url ? `<img src="${it.foto_url}" alt="">` : `<i class="fas fa-image"></i>`}
      </div>
      <div class="carrinho-info">
        <div class="nome">${escapeHtml(it.modelo)} — ${escapeHtml(it.cor)}</div>
        <div class="det">Nº <b>${it.numeracao}</b> · ${it.qtd} ${it.qtd === 1 ? "par" : "pares"}</div>
        <div class="det">${formatarMoeda(it.preco)} /par</div>
        ${textoEstoque}
      </div>
      <button class="carrinho-remover" data-idx="${i}" aria-label="Remover">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `}).join("");

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

  // Se tá em modo adição, muda o texto e o comportamento do botão
  if (modoAdicaoAtivo && modoAdicaoChave) {
    aviso.classList.remove("show");
    btnEnviar.disabled = totalPares === 0;
    btnEnviar.innerHTML = `<i class="fas fa-plus-circle"></i> Adicionar ao pedido ${modoAdicaoChave}`;
    btnEnviar.onclick = adicionarCarrinhoAoPedido;
  } else {
    // Modo normal
    btnEnviar.disabled = totalPares === 0;
    
    // Aviso sobre o mínimo de envio (6 pares)
    if (totalPares > 0 && totalPares < MINIMO_ENVIO) {
      aviso.classList.add("show");
      aviso.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>Atenção:</strong> O pedido só será despachado a partir de ${MINIMO_ENVIO} pares. Faltam ${MINIMO_ENVIO - totalPares} pares.`;
    } else {
      aviso.classList.remove("show");
    }
    
    btnEnviar.innerHTML = '<i class="fas fa-check-circle"></i> Finalizar Pedido';
    btnEnviar.onclick = abrirFormFechamento;
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
// FECHAMENTO DE PEDIDO
// ============================================
let chavePedidoGerada = null;
let dadosUltimoPedido = null;
let descontoRevendedor = null; // { valido, desconto_tipo, desconto_valor, nome }
let validandoChaveTimer = null;

// ============================================
// MEU PEDIDO — Sessão + Auth por WhatsApp/Senha
// ============================================
let meuPedidoAtual = null;
let meuPedidoChave = null;
let meuPedidoWhatsapp = null;
let modoAdicaoAtivo = false;
let modoAdicaoChave = null;
let modoAdicaoWhatsapp = null;

// Sessão do cliente (7 dias no localStorage)
const SESSION_KEY = "max_site_sessao";
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function salvarSessaoCliente(dados) {
  try {
    const sessao = { ...dados, exp: Date.now() + SESSION_TTL };
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessao));
  } catch (e) {}
}

function carregarSessaoCliente() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.exp || s.exp < Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return s;
  } catch (e) { return null; }
}

function limparSessaoCliente() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}

// ============================================
// VALIDAÇÃO DE ESTOQUE EM TEMPO REAL
// ============================================
async function validarEstoqueCarrinho() {
  if (!carrinho || carrinho.length === 0) return false;

  try {
    const res = await fetch(API_BASE + "/publico/produtos");
    const data = await res.json();
    if (!data.success) return false;

    const produtosAtualizados = data.produtos || [];
    let temItemSemEstoque = false;

    for (const itemCarrinho of carrinho) {
      const prod = produtosAtualizados.find(p => p.id === itemCarrinho.produto_id);
      if (prod) {
        const variacao = (prod.grade || []).find(g => g.numeracao === itemCarrinho.numeracao);
        if (variacao) {
          itemCarrinho.estoque_atual = variacao.disponivel || 0;
          if (itemCarrinho.estoque_atual < itemCarrinho.qtd) temItemSemEstoque = true;
        } else {
          itemCarrinho.estoque_atual = 0;
          temItemSemEstoque = true;
        }
      } else {
        itemCarrinho.estoque_atual = 0;
        temItemSemEstoque = true;
      }
    }
    return temItemSemEstoque;
  } catch (e) {
    console.error("Erro ao validar estoque:", e);
    return false;
  }
}

// ============================================
// MODAL ACESSAR (login/cadastro unificado)
// ============================================
function abrirModalAcessar() {
  const modal = document.getElementById("modalAcessar");
  if (!modal) return;
  document.getElementById("acessarForm").style.display = "flex";
  document.getElementById("criarSenhaForm").style.display = "none";
  document.getElementById("acessarErro").style.display = "none";
  document.getElementById("criarSenhaErro").style.display = "none";

  // Se tem sessão salva, pré-preenche WhatsApp
  const sessao = carregarSessaoCliente();
  if (sessao && sessao.whatsapp) {
    document.getElementById("acessarWhatsapp").value = sessao.whatsapp;
    document.getElementById("acessarSenha").focus();
  } else {
    document.getElementById("acessarWhatsapp").focus();
  }

  modal.classList.add("active");
  document.body.style.overflow = "hidden";
}

function fecharModalAcessar() {
  const modal = document.getElementById("modalAcessar");
  if (modal) modal.classList.remove("active");
  document.body.style.overflow = "";
}

// ============================================
// LOGIN (WhatsApp + senha)
// ============================================
async function fazerLoginCliente() {
  const whatsapp = (document.getElementById("acessarWhatsapp").value || "").trim();
  const senha = document.getElementById("acessarSenha").value || "";
  const erroEl = document.getElementById("acessarErro");
  const btn = document.getElementById("btnAcessar");

  erroEl.style.display = "none";

  if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Digite um WhatsApp válido`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

  try {
    const body = { whatsapp };
    if (senha) body.senha = senha;

    const res = await fetch(API_BASE + "/publico/auth-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) {
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(data.error || "Erro ao verificar")}`;
      return;
    }

    // Cliente não cadastrado
    if (data.encontrado === false) {
      abrirTelaCriarSenha(whatsapp, { novoCliente: true });
      return;
    }

    // Cliente tem cadastro mas sem senha
    if (data.precisa_senha && !data.tem_senha) {
      abrirTelaCriarSenha(whatsapp, {
        novoCliente: false,
        cadastroIncompleto: data.cadastro_incompleto || [],
      });
      return;
    }

    // Cliente tem senha, mas não digitou
    if (data.precisa_senha && data.tem_senha) {
      document.getElementById("acessarSenhaWrap").style.display = "block";
      document.getElementById("acessarSenhaAjuda").style.display = "none";
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-lock"></i> Digite sua senha pra entrar`;
      document.getElementById("acessarSenha").focus();
      return;
    }

    // Login OK
    if (data.auth_ok) {
      salvarSessaoCliente({
        whatsapp: data.telefone || whatsapp,
        nome: data.nome,
        cliente_id: data.cliente_id,
        is_revendedor: data.is_revendedor,
      });

      // Se tem pedido pendente → abre ele
      if (data.tem_pedido_pendente && data.pedido_pendente) {
        meuPedidoChave = data.pedido_pendente.chave;
        meuPedidoWhatsapp = data.telefone || whatsapp;
        fecharModalAcessar();
        await recarregarMeuPedido();
        document.getElementById("modalMeuPedido").classList.add("active");
        document.body.style.overflow = "hidden";
      } else {
        fecharModalAcessar();
        mostrarToastAdd("✅ Login OK! Nenhum pedido em aberto.");
      }
    }
  } catch (e) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erro: ${escapeHtml(e.message)}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Entrar';
  }
}

// ============================================
// TELA DE CRIAR SENHA
// ============================================
function abrirTelaCriarSenha(whatsapp, opts) {
  document.getElementById("acessarForm").style.display = "none";
  document.getElementById("criarSenhaForm").style.display = "flex";
  document.getElementById("criarSenhaErro").style.display = "none";

  const novo = opts.novoCliente === true;
  const faltando = opts.cadastroIncompleto || [];

  // Mostra campos conforme necessidade
  const mostrar = (id, cond) => {
    const el = document.getElementById(id);
    if (el) el.style.display = cond ? "block" : "none";
  };

  // Nome
  mostrar("criarSenhaNomeWrap", novo || faltando.includes("nome"));
  // CPF
  mostrar("criarSenhaCpfWrap", novo || faltando.includes("cpf"));
  // CEP
  mostrar("criarSenhaCepWrap", novo || faltando.includes("cep"));
  // Endereço
  mostrar("criarSenhaEnderecoWrap", novo || faltando.includes("endereco"));
  // Número + Bairro
  const precisaNum = novo || faltando.includes("numero");
  const precisaBairro = novo || faltando.includes("bairro");
  mostrar("criarSenhaNumBairroWrap", precisaNum || precisaBairro);
  mostrar("criarSenhaNumWrap", precisaNum);
  mostrar("criarSenhaBairroWrap", precisaBairro);
  // Cidade + UF
  const precisaCidade = novo || faltando.includes("cidade");
  const precisaUf = novo || faltando.includes("uf");
  mostrar("criarSenhaCidadeUfWrap", precisaCidade || precisaUf);
  mostrar("criarSenhaCidadeWrap", precisaCidade);
  mostrar("criarSenhaUfWrap", precisaUf);

  // Guarda o whatsapp pra usar no submit
  document.getElementById("btnCriarSenha").dataset.whatsapp = whatsapp;
  document.getElementById("btnCriarSenha").dataset.novoCliente = novo ? "1" : "0";

  const aviso = document.getElementById("criarSenhaAviso");
  if (novo) {
    aviso.innerHTML = `<strong><i class="fas fa-user-plus"></i> Primeira vez por aqui!</strong><br>
      Crie uma senha (mínimo 6 caracteres) e preencha seus dados. Depois é só entrar com WhatsApp + senha.`;
  } else {
    aviso.innerHTML = `<strong><i class="fas fa-lock"></i> Falta pouco!</strong><br>
      Crie uma senha (mínimo 6 caracteres)${faltando.length > 0 ? " e complete os dados que faltam" : ""} pra continuar.`;
  }

  setTimeout(() => {
    const primeiroVisivel = document.querySelector('#criarSenhaForm input:not([style*="display:none"])');
    if (primeiroVisivel) primeiroVisivel.focus();
  }, 200);
}

async function criarSenhaCliente() {
  const btn = document.getElementById("btnCriarSenha");
  const whatsapp = btn.dataset.whatsapp;
  const novo = btn.dataset.novoCliente === "1";
  const senha = document.getElementById("csSenha").value || "";
  const senha2 = document.getElementById("csSenha2").value || "";
  const erroEl = document.getElementById("criarSenhaErro");

  erroEl.style.display = "none";

  if (senha.length < 6) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Senha deve ter pelo menos 6 caracteres`;
    return;
  }
  if (senha !== senha2) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> As senhas não batem`;
    return;
  }

  const body = { whatsapp, senha };

  if (novo) {
    // Cliente novo: todos os campos obrigatórios
    const nome = document.getElementById("csNome").value.trim();
    const cpf = document.getElementById("csCpf").value.trim();
    const cep = document.getElementById("csCep").value.trim();
    const endereco = document.getElementById("csEndereco").value.trim();
    const numero = document.getElementById("csNumero").value.trim();
    const bairro = document.getElementById("csBairro").value.trim();
    const cidade = document.getElementById("csCidade").value.trim();
    const uf = document.getElementById("csUf").value.trim().toUpperCase();

    if (!nome || !cpf || !cep || !endereco || !numero || !bairro || !cidade || !uf) {
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Preencha todos os campos obrigatórios`;
      return;
    }
    Object.assign(body, { nome, cpf, cep, endereco, numero, bairro, cidade, uf });
  } else {
    // Cliente existente: envia só o que está visível
    const get = (id) => {
      const el = document.getElementById(id);
      if (!el || el.offsetParent === null) return null;
      return el.value.trim();
    };
    const nome = get("csNome");
    const cpf = get("csCpf");
    const cep = get("csCep");
    const endereco = get("csEndereco");
    const numero = get("csNumero");
    const bairro = get("csBairro");
    const cidade = get("csCidade");
    const uf = get("csUf");
    if (nome) body.nome = nome;
    if (cpf) body.cpf = cpf;
    if (cep) body.cep = cep;
    if (endereco) body.endereco = endereco;
    if (numero) body.numero = numero;
    if (bairro) body.bairro = bairro;
    if (cidade) body.cidade = cidade;
    if (uf) body.uf = uf.toUpperCase();
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const res = await fetch(API_BASE + "/publico/cliente-criar-senha", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.success) {
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(data.error)}`;
      return;
    }

    salvarSessaoCliente({ whatsapp, cliente_id: data.cliente_id });

    // Login automático após criar senha
    const res2 = await fetch(API_BASE + "/publico/auth-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify({ whatsapp, senha }),
    });
    const data2 = await res2.json();

    if (data2.success && data2.auth_ok) {
      salvarSessaoCliente({
        whatsapp: data2.telefone || whatsapp,
        nome: data2.nome,
        cliente_id: data2.cliente_id,
        is_revendedor: data2.is_revendedor,
      });

      fecharModalAcessar();
      mostrarToastAdd("✅ Senha criada! Você já está logado.");

      if (data2.tem_pedido_pendente && data2.pedido_pendente) {
        meuPedidoChave = data2.pedido_pendente.chave;
        meuPedidoWhatsapp = data2.telefone || whatsapp;
        await recarregarMeuPedido();
        document.getElementById("modalMeuPedido").classList.add("active");
        document.body.style.overflow = "hidden";
      }
    } else {
      fecharModalAcessar();
      mostrarToastAdd("✅ Senha criada!");
    }
  } catch (e) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erro: ${escapeHtml(e.message)}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Criar senha e continuar';
  }
}

// ============================================
// ABRIR "MEU PEDIDO" (chamado pelo header)
// ============================================
function abrirMeuPedido() {
  const sessao = carregarSessaoCliente();
  if (sessao && sessao.whatsapp) {
    // Já logado: abre direto
    document.getElementById("acessarWhatsapp").value = sessao.whatsapp;
    abrirModalAcessar();
    // Auto-fill senha se tiver
    setTimeout(() => document.getElementById("acessarSenha").focus(), 300);
  } else {
    abrirModalAcessar();
  }
}

// ============================================
// BUSCA POR CÓDIGO (fallback)
// ============================================
function abrirBuscaPedido() {
  document.getElementById("buscaChave").value = "";
  document.getElementById("buscaWhatsapp").value = "";
  document.getElementById("buscaErro").style.display = "none";
  document.getElementById("modalBuscarPedido").classList.add("active");
  document.body.style.overflow = "hidden";
  setTimeout(() => document.getElementById("buscaChave").focus(), 200);
}

function fecharBuscaPedido() {
  document.getElementById("modalBuscarPedido").classList.remove("active");
  document.body.style.overflow = "";
}

function fecharMeuPedido() {
  document.getElementById("modalMeuPedido").classList.remove("active");
  document.body.style.overflow = "";
  if (!modoAdicaoAtivo) {
    meuPedidoAtual = null;
    meuPedidoChave = null;
    meuPedidoWhatsapp = null;
  }
}

async function buscarMeuPedido() {
  const chave = (document.getElementById("buscaChave").value || "").trim().toUpperCase();
  const whatsapp = (document.getElementById("buscaWhatsapp").value || "").trim();
  const erroEl = document.getElementById("buscaErro");
  const btn = document.getElementById("btnBuscarPedido");

  if (!chave || chave.length < 6) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Digite a chave completa (6 caracteres)`;
    return;
  }
  if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Digite um WhatsApp válido`;
    return;
  }

  erroEl.style.display = "none";
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Buscando...';

  try {
    const res = await fetch(API_BASE + "/publico/meu-pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify({ chave, whatsapp }),
    });
    const data = await res.json();

    if (!data.success) {
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(data.error || "Pedido não encontrado")}`;
      return;
    }

    meuPedidoAtual = data.pedido;
    meuPedidoChave = chave;
    meuPedidoWhatsapp = whatsapp;

    fecharBuscaPedido();
    renderizarMeuPedido();
    document.getElementById("modalMeuPedido").classList.add("active");
    document.body.style.overflow = "hidden";
  } catch (e) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erro: ${escapeHtml(e.message)}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-search"></i> Buscar Pedido';
  }
}

// ============================================
// RENDERIZAR MODAL "MEU PEDIDO"
// ============================================
function renderizarMeuPedido() {
  if (!meuPedidoAtual) return;
  const p = meuPedidoAtual;

  document.getElementById("meuPedidoChave").textContent = p.chave;

  const statusEl = document.getElementById("meuPedidoStatus");
  statusEl.className = "meu-pedido-status " + (p.status || "pendente");
  const statusTexto = {
    pendente: "⏳ Aguardando aprovação do vendedor",
    aprovado: "✅ Pedido aprovado e reservado",
    rejeitado: "❌ Pedido rejeitado pelo vendedor",
  };
  statusEl.textContent = statusTexto[p.status] || p.status;

  const itensEl = document.getElementById("meuPedidoItens");
  const rodapeEl = document.getElementById("meuPedidoRodape");
  const vazioEl = document.getElementById("meuPedidoVazio");
  const btnAdicionar = document.getElementById("btnAdicionarAoPedido");

  if (!p.itens || p.itens.length === 0) {
    itensEl.innerHTML = "";
    vazioEl.style.display = "block";
    rodapeEl.style.display = "none";
    return;
  }

  vazioEl.style.display = "none";
  rodapeEl.style.display = "block";

  let html = "";
  for (const it of p.itens) {
    html += `
      <div class="meu-pedido-item">
        <div class="foto">
          ${it.foto_url ? `<img src="${it.foto_url}" alt="">` : `<i class="fas fa-image"></i>`}
        </div>
        <div class="info">
          <div class="nome">${escapeHtml(it.modelo)} — ${escapeHtml(it.cor)}</div>
          <div class="det">Nº <b>${it.numeracao}</b></div>
        </div>
        <div class="qtd">${it.quantidade}x</div>
        ${p.status !== "rejeitado" ? `<button class="btn-remover-item" data-variacao-id="${it.variacao_id}" title="Remover"><i class="fas fa-trash"></i></button>` : ""}
      </div>
    `;
  }
  itensEl.innerHTML = html;

  itensEl.querySelectorAll("[data-variacao-id]").forEach(btn => {
    btn.onclick = () => removerItemDoPedido(parseInt(btn.dataset.variacaoId), btn);
  });

  document.getElementById("meuPedidoTotalPares").textContent = p.total_pares;

  if (p.desconto_aplicado && p.desconto_aplicado > 0) {
    document.getElementById("meuPedidoLinhaOriginal").style.display = "flex";
    document.getElementById("meuPedidoLinhaDesconto").style.display = "flex";
    document.getElementById("meuPedidoValorOriginal").textContent = formatarMoeda(p.valor_original || 0);
    document.getElementById("meuPedidoDesconto").textContent = "- " + formatarMoeda(p.desconto_aplicado);
  } else {
    document.getElementById("meuPedidoLinhaOriginal").style.display = "none";
    document.getElementById("meuPedidoLinhaDesconto").style.display = "none";
  }

  document.getElementById("meuPedidoValorTotal").textContent = formatarMoeda(p.valor_estimado);

  if (p.status === "rejeitado") {
    btnAdicionar.style.display = "none";
  } else {
    btnAdicionar.style.display = "flex";
    btnAdicionar.onclick = entrarModoAdicao;
  }

  const btnConfirmar = document.getElementById("btnConfirmarMeuPedido");
  if (btnConfirmar) {
    btnConfirmar.onclick = () => enviarAvisoWhatsAppPedido();
  }
}

function enviarAvisoWhatsAppPedido() {
  if (!meuPedidoAtual) return;
  const p = meuPedidoAtual;

  let msg = `*MAX REPRESENTAÇÃO*\n\nOlá! Atualizei meu pedido.\n\n`;
  msg += `🔑 Chave: *${p.chave}*\n`;
  msg += `👤 Nome: ${p.nome_cliente}\n`;
  msg += `📱 WhatsApp: ${p.telefone_cliente}\n\n`;
  msg += `📦 *ITENS ATUAIS:*\n`;

  for (const it of p.itens) {
    msg += `• ${it.modelo} — ${it.cor} · Nº ${it.numeracao} · ${it.quantidade} ${it.quantidade === 1 ? "par" : "pares"}\n`;
  }

  msg += `\n*Total de pares: ${p.total_pares}*\n`;

  if (p.desconto_aplicado && p.desconto_aplicado > 0) {
    msg += `Valor original: R$ ${(p.valor_original || 0).toFixed(2).replace(".", ",")}\n`;
    msg += `Desconto: -R$ ${p.desconto_aplicado.toFixed(2).replace(".", ",")}\n`;
    msg += `*Total: R$ ${(p.valor_estimado || 0).toFixed(2).replace(".", ",")}*\n`;
  } else {
    msg += `*Total: R$ ${(p.valor_estimado || 0).toFixed(2).replace(".", ",")}*\n`;
  }

  msg += `\nQualquer dúvida, estamos à disposição! 😊`;
  abrirWhatsApp(msg);
}

async function removerItemDoPedido(variacaoId, btn) {
  if (!confirm("Remover este item do pedido?")) return;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const res = await fetch(API_BASE + "/publico/meu-pedido/remover-item", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify({
        chave: meuPedidoChave,
        whatsapp: meuPedidoWhatsapp,
        variacao_id: variacaoId,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      alert("Erro: " + (data.error || "Não foi possível remover"));
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-trash"></i>';
      return;
    }
    await recarregarMeuPedido();
    mostrarToastAdd("Item removido do pedido");
  } catch (e) {
    alert("Erro: " + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-trash"></i>';
  }
}

async function recarregarMeuPedido() {
  try {
    const res = await fetch(API_BASE + "/publico/meu-pedido", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify({ chave: meuPedidoChave, whatsapp: meuPedidoWhatsapp }),
    });
    const data = await res.json();
    if (data.success) {
      meuPedidoAtual = data.pedido;
      renderizarMeuPedido();
    }
  } catch (e) {
    console.error("[recarregarMeuPedido]", e);
  }
}

function entrarModoAdicao() {
  modoAdicaoChave = meuPedidoChave;
  modoAdicaoWhatsapp = meuPedidoWhatsapp;
  modoAdicaoAtivo = true;
  fecharMeuPedido();

  document.getElementById("bannerPedidoChave").textContent = modoAdicaoChave;
  document.getElementById("bannerVoltandoPedido").style.display = "block";

  const yOffset = -150;
  const catalogo = document.getElementById("produtos");
  if (catalogo) {
    const y = catalogo.getBoundingClientRect().top + window.pageYOffset + yOffset;
    window.scrollTo({ top: y, behavior: "smooth" });
  } else {
    window.scrollTo({ top: 150, behavior: "smooth" });
  }
}

function cancelarModoAdicao() {
  modoAdicaoAtivo = false;
  modoAdicaoChave = null;
  modoAdicaoWhatsapp = null;
  document.getElementById("bannerVoltandoPedido").style.display = "none";
  carrinho = [];
  atualizarCarrinho();
}

async function adicionarCarrinhoAoPedido() {
  if (!modoAdicaoAtivo || !modoAdicaoChave) {
    alert("Modo adição inativo. Busque seu pedido novamente.");
    return;
  }
  if (carrinho.length === 0) {
    alert("Seu carrinho está vazio.");
    return;
  }

  const itens = carrinho.map(it => ({
    produto_id: it.produto_id,
    numeracao: it.numeracao,
    quantidade: it.qtd,
  }));

  const btn = document.querySelector("#modalCarrinho #carrinhoEnviar");
  const btnOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adicionando...';

  try {
    const res = await fetch(API_BASE + "/publico/meu-pedido/adicionar-itens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify({ chave: modoAdicaoChave, whatsapp: modoAdicaoWhatsapp, itens }),
    });
    const data = await res.json();

    if (!data.success) {
      let msg = data.error || "Não foi possível adicionar";
      if (data.itens_com_erro && data.itens_com_erro.length > 0) {
        msg += "\n\nItens com problema:\n";
        for (const err of data.itens_com_erro) msg += `• ${err.motivo}\n`;
      }
      alert(msg);
      btn.disabled = false;
      btn.innerHTML = btnOriginal;
      return;
    }

    carrinho = [];
    atualizarCarrinho();
    fecharModalCarrinho();

    const chaveReabrir = modoAdicaoChave;
    const whatsReabrir = modoAdicaoWhatsapp;
    cancelarModoAdicao();

    meuPedidoChave = chaveReabrir;
    meuPedidoWhatsapp = whatsReabrir;

    await recarregarMeuPedido();
    document.getElementById("modalMeuPedido").classList.add("active");
    document.body.style.overflow = "hidden";

    let msg = `✅ ${data.itens_adicionados.length} item(ns) adicionado(s)!`;
    if (data.itens_com_erro && data.itens_com_erro.length > 0) msg += ` (${data.itens_com_erro.length} com erro)`;
    mostrarToastAdd(msg);
  } catch (e) {
    alert("Erro: " + e.message);
    btn.disabled = false;
    btn.innerHTML = btnOriginal;
  }
}

// ============================================
// ETAPA 1: IDENTIFICAR CLIENTE (WhatsApp + senha)
// ============================================
async function continuarIdentificacao() {
  const whatsapp = (document.getElementById("fpTelefone").value || "").trim();
  const senha = document.getElementById("fpSenha").value || "";
  const erroEl = document.getElementById("fpErroIdent");
  const btn = document.getElementById("btnContinuarIdent");

  erroEl.style.display = "none";

  if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Digite um WhatsApp válido com DDD`;
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando...';

  try {
    const body = { whatsapp };
    if (senha) body.senha = senha;

    const res = await fetch(API_BASE + "/publico/auth-cliente", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Site-Token": "max-site-2026" },
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!data.success) {
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(data.error || "Erro")}`;
      return;
    }

    // Cliente novo → pede senha + dados completos
    if (data.encontrado === false) {
      irParaEtapaDados({ novoCliente: true, senhaNova: true });
      return;
    }

    // Tem cadastro mas sem senha → pede senha + (só os dados que faltam)
    if (data.precisa_senha && !data.tem_senha) {
      irParaEtapaDados({
        novoCliente: false,
        senhaNova: true,
        cadastroIncompleto: data.cadastro_incompleto || [],
      });
      return;
    }

    // Tem senha, mas não digitou → pede senha
    if (data.precisa_senha && data.tem_senha) {
      document.getElementById("fpSenhaWrap").style.display = "block";
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-lock"></i> Digite sua senha pra continuar`;
      document.getElementById("fpSenha").focus();
      return;
    }

    // Login OK
    if (data.auth_ok) {
      salvarSessaoCliente({
        whatsapp: data.telefone || whatsapp,
        nome: data.nome,
        cliente_id: data.cliente_id,
        is_revendedor: data.is_revendedor,
      });

      // Se tem pedido pendente → avisa e oferece adicionar
      if (data.tem_pedido_pendente && data.pedido_pendente) {
        const chave = data.pedido_pendente.chave;
        const resp = confirm(
          `Você já tem um pedido em aberto (chave ${chave}).\n\n` +
          `Deseja ADICIONAR os itens do carrinho nele?\n\n` +
          `OK = adicionar ao pedido existente\n` +
          `Cancelar = criar um pedido novo (o antigo será mantido)`
        );

        if (resp) {
          // Adicionar ao existente
          meuPedidoChave = chave;
          meuPedidoWhatsapp = data.telefone || whatsapp;
          modoAdicaoChave = chave;
          modoAdicaoWhatsapp = data.telefone || whatsapp;
          modoAdicaoAtivo = true;
          fecharFormFechamento();
          await adicionarCarrinhoAoPedido();
          return;
        } else {
          // Criar novo — mas a API vai bloquear. Avisa.
          alert(`Pra criar um pedido novo, você precisa primeiro finalizar ou cancelar o pedido em aberto (chave ${chave}).\n\nFale com o vendedor pelo WhatsApp.`);
          fecharFormFechamento();
          return;
        }
      }

      // Sem pedido pendente → segue pro pedido novo (só revisa dados)
      irParaEtapaDados({
        novoCliente: false,
        senhaNova: false,
        cadastroIncompleto: data.cadastro_incompleto || [],
        cliente: data,
      });
    }
  } catch (e) {
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erro: ${escapeHtml(e.message)}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-arrow-right"></i> Continuar';
  }
}

function irParaEtapaDados(opts) {
  document.getElementById("fpIdentificacao").style.display = "none";
  document.getElementById("fpDados").style.display = "block";

  const novo = opts.novoCliente === true;
  const senhaNova = opts.senhaNova === true;
  const faltando = opts.cadastroIncompleto || [];
  const cliente = opts.cliente || null;

  // Preenche dados se cliente existente
  if (cliente) {
    document.getElementById("fpNome").value = cliente.nome || "";
    document.getElementById("fpCpf").value = cliente.cpf || "";
    document.getElementById("fpCep").value = cliente.cep || "";
    document.getElementById("fpEndereco").value = cliente.endereco || "";
    document.getElementById("fpNumero").value = cliente.numero || "";
    document.getElementById("fpBairro").value = cliente.bairro || "";
    document.getElementById("fpCidade").value = cliente.cidade || "";
    document.getElementById("fpUf").value = cliente.uf || "";
  }

  // Senha nova (primeira vez ou cadastro incompleto sem senha)
  document.getElementById("fpSenhaNovaWrap").style.display = senhaNova ? "block" : "none";
  document.getElementById("fpSenhaNova2Wrap").style.display = senhaNova ? "block" : "none";

  // Campos obrigatórios: se for novo, todos. Se não, só os que faltam ficam em destaque
  const campos = ["fpNome", "fpCpf", "fpCep", "fpEndereco", "fpNumero", "fpBairro", "fpCidade", "fpUf"];
  for (const id of campos) {
    const el = document.getElementById(id);
    if (!el) continue;
    const key = id.replace("fp", "").toLowerCase();
    if (novo || faltando.includes(key)) {
      el.required = true;
      el.style.borderColor = "var(--amarelo)";
    } else {
      el.required = false;
      el.style.borderColor = "";
    }
  }

    setTimeout(() => {
    const primeiro = document.querySelector('#fpDados input:not([type="password"])');
    if (primeiro) primeiro.focus();
  }, 200);
}

function fecharFormFechamento() {
  document.getElementById("modalFecharPedido").classList.remove("active");
  document.body.style.overflow = "";
  }
}

// ============================================
// INICIALIZAÇÃO
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  temaAtual = getTemaSalvo();
  aplicarTema();

  const anoEl = document.getElementById("anoAtual");
  if (anoEl) anoEl.textContent = new Date().getFullYear();

  // Tema
  const temaToggle = document.getElementById("temaToggle");
  if (temaToggle) temaToggle.addEventListener("click", alternarTema);
    // ============================================
  // MEU PEDIDO — Listeners
  // ============================================
  const btnMeuPedido = document.getElementById("headerMeuPedido");
  if (btnMeuPedido) btnMeuPedido.addEventListener("click", abrirMeuPedido);

  // Modal Acessar
  const btnAcessarFechar = document.getElementById("modalAcessarFechar");
  if (btnAcessarFechar) btnAcessarFechar.addEventListener("click", fecharModalAcessar);

  const modalAcessar = document.getElementById("modalAcessar");
  if (modalAcessar) modalAcessar.addEventListener("click", (e) => {
    if (e.target.id === "modalAcessar") fecharModalAcessar();
  });

  const btnAcessar = document.getElementById("btnAcessar");
  if (btnAcessar) btnAcessar.addEventListener("click", fazerLoginCliente);

  const btnCriarSenha = document.getElementById("btnCriarSenha");
  if (btnCriarSenha) btnCriarSenha.addEventListener("click", criarSenhaCliente);

  const btnVoltarAcessar = document.getElementById("btnVoltarAcessar");
  if (btnVoltarAcessar) btnVoltarAcessar.addEventListener("click", () => {
    document.getElementById("acessarForm").style.display = "flex";
    document.getElementById("criarSenhaForm").style.display = "none";
  });

  const btnAcessarComCodigo = document.getElementById("btnAcessarComCodigo");
  if (btnAcessarComCodigo) btnAcessarComCodigo.addEventListener("click", () => {
    fecharModalAcessar();
    setTimeout(abrirBuscaPedido, 200);
  });

  // Enter nos campos de login
  const acessarWhats = document.getElementById("acessarWhatsapp");
  const acessarSenha = document.getElementById("acessarSenha");
  if (acessarWhats) acessarWhats.addEventListener("keydown", (e) => { if (e.key === "Enter") fazerLoginCliente(); });
  if (acessarSenha) acessarSenha.addEventListener("keydown", (e) => { if (e.key === "Enter") fazerLoginCliente(); });

  // Modal de busca por código
  const btnBuscarFechar = document.getElementById("modalBuscarPedidoFechar");
  if (btnBuscarFechar) btnBuscarFechar.addEventListener("click", fecharBuscaPedido);

  const modalBuscar = document.getElementById("modalBuscarPedido");
  if (modalBuscar) modalBuscar.addEventListener("click", (e) => {
    if (e.target.id === "modalBuscarPedido") fecharBuscaPedido();
  });

  const btnBuscar = document.getElementById("btnBuscarPedido");
  if (btnBuscar) btnBuscar.addEventListener("click", buscarMeuPedido);

  const buscaChaveInput = document.getElementById("buscaChave");
  const buscaWhatsInput = document.getElementById("buscaWhatsapp");
  if (buscaChaveInput) {
    buscaChaveInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase();
      if (e.target.value.length === 6 && buscaWhatsInput) buscaWhatsInput.focus();
    });
    buscaChaveInput.addEventListener("keydown", (e) => { if (e.key === "Enter") buscarMeuPedido(); });
  }
  if (buscaWhatsInput) {
    buscaWhatsInput.addEventListener("keydown", (e) => { if (e.key === "Enter") buscarMeuPedido(); });
  }

  const btnFecharMeu = document.getElementById("modalMeuPedidoFechar");
  if (btnFecharMeu) btnFecharMeu.addEventListener("click", fecharMeuPedido);

  const btnFecharMeu2 = document.getElementById("btnFecharMeuPedido");
  if (btnFecharMeu2) btnFecharMeu2.addEventListener("click", fecharMeuPedido);

  const modalMeu = document.getElementById("modalMeuPedido");
  if (modalMeu) modalMeu.addEventListener("click", (e) => {
    if (e.target.id === "modalMeuPedido") fecharMeuPedido();
  });

  const btnCancelarModo = document.getElementById("btnCancelarModoAdicao");
  if (btnCancelarModo) btnCancelarModo.addEventListener("click", cancelarModoAdicao);

  // Novo botão Continuar (etapa 1 do fechamento)
  const btnContinuarIdent = document.getElementById("btnContinuarIdent");
  if (btnContinuarIdent) btnContinuarIdent.addEventListener("click", continuarIdentificacao);

  // Enter nos campos de identificação
  const fpTel = document.getElementById("fpTelefone");
  const fpSenha = document.getElementById("fpSenha");
  if (fpTel) fpTel.addEventListener("keydown", (e) => { if (e.key === "Enter") continuarIdentificacao(); });
  if (fpSenha) fpSenha.addEventListener("keydown", (e) => { if (e.key === "Enter") continuarIdentificacao(); });  

  // Instalar PWA
  const btnInstalar = document.getElementById("btnInstalar");
  if (btnInstalar) btnInstalar.addEventListener("click", instalarPWA);

  // Recarregar + boas-vindas
  const btnRec = document.getElementById("btnRecarregar");
  if (btnRec) btnRec.addEventListener("click", () => { carregarCategorias(); carregarProdutos(); });
  const btnBv = document.getElementById("boasVindasFechar");
  if (btnBv) btnBv.addEventListener("click", fecharBoasVindas);

  // Modal produto
  const mf = document.getElementById("modalFechar");
  if (mf) mf.addEventListener("click", fecharModalProduto);
  const mp = document.getElementById("modalProduto");
  if (mp) mp.addEventListener("click", (e) => {
    if (e.target.id === "modalProduto") fecharModalProduto();
  });

  // Carrinho
  const hc = document.getElementById("headerCarrinho");
  if (hc) hc.addEventListener("click", abrirModalCarrinho);
  const mcf = document.getElementById("modalCarrinhoFechar");
  if (mcf) mcf.addEventListener("click", fecharModalCarrinho);
  const mc = document.getElementById("modalCarrinho");
  if (mc) mc.addEventListener("click", (e) => {
    if (e.target.id === "modalCarrinho") fecharModalCarrinho();
  });
  const cl = document.getElementById("carrinhoLimpar");
  if (cl) cl.addEventListener("click", limparCarrinho);

    // Finalizar pedido — listener movido pra dentro do abrirModalCarrinho
  // (porque o comportamento muda se estiver em modo adição)
  
  // Modal de formulário
  const bf = document.getElementById("btnFecharModalForm");
  if (bf) bf.addEventListener("click", fecharFormFechamento);
  const bc = document.getElementById("btnConfirmarFechamento");
  if (bc) bc.addEventListener("click", confirmarFechamento);
  const mfp = document.getElementById("modalFecharPedido");
  if (mfp) mfp.addEventListener("click", (e) => {
    if (e.target.id === "modalFecharPedido") fecharFormFechamento();
  });

    // ESC fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharModalProduto();
      fecharModalCarrinho();
      fecharFormFechamento();
    }
  });

  // Recupera carrinho salvo (se tiver)
  recuperarCarrinhoLocal();
  atualizarCarrinho();

  // Carrega a frase bíblica do dia
  carregarMensagemDoDia();

  // Carrega categorias primeiro, depois produtos
  carregarCategorias();
  carregarProdutos();
  mostrarBoasVindas();
});

// ============================================
// MENSAGEM BÍBLICA DO DIA
// ============================================
const MENSAGENS_BIBLICAS = [
  "O Senhor é o meu pastor; nada me faltará. (Salmos 23:1)",
  "Tudo posso naquele que me fortalece. (Filipenses 4:13)",
  "O Senhor é a minha luz e a minha salvação; a quem temerei? (Salmos 27:1)",
  "Confia no Senhor de todo o teu coração. (Provérbios 3:5)",
  "Alegrai-vos na esperança, sede pacientes na tribulação, perseverai na oração. (Romanos 12:12)",
  "O amor é paciente, o amor é bondoso. Não inveja, não se vangloria, não se orgulha. (1 Coríntios 13:4)",
  "Buscai primeiro o Reino de Deus e a sua justiça, e todas essas coisas vos serão acrescentadas. (Mateus 6:33)",
  "O Senhor te abençoe e te guarde. (Números 6:24)",
  "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus. (Isaías 41:10)",
  "A fé é a certeza daquilo que esperamos e a prova das coisas que não vemos. (Hebreus 11:1)",
  "Se Deus é por nós, quem será contra nós? (Romanos 8:31)",
  "A graça do Senhor Jesus Cristo esteja com todos. (Apocalipse 22:21)",
  "Portanto, não vos preocupeis com o amanhã, pois o amanhã trará as suas próprias preocupações. (Mateus 6:34)",
  "O Senhor é bom, um refúgio em tempos de angústia. Ele protege os que nele confiam. (Naum 1:7)",
  "Vinde a mim, todos os que estais cansados e oprimidos, e eu vos aliviarei. (Mateus 11:28)",
  "O choro pode durar uma noite, mas a alegria vem pela manhã. (Salmos 30:5)",
  "Ainda que eu ande pelo vale da sombra da morte, não temerei mal algum, porque tu estás comigo. (Salmos 23:4)",
  "O Senhor é o meu rochedo, a minha fortaleza e o meu libertador. (Salmos 18:2)",
  "Sê forte e corajoso; não temas, nem te espantes, porque o Senhor teu Deus é contigo. (Josué 1:9)",
  "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós. (1 Pedro 5:7)"
];

function carregarMensagemDoDia() {
  const el = document.getElementById("mensagemBiblica");
  if (!el) return;

  // Pega o dia do ano (1 a 365) para variar a mensagem
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), 0, 0);
  const diff = hoje - inicio;
  const diaDoAno = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Usa o dia do ano para escolher a mensagem de forma determinística
  const index = diaDoAno % MENSAGENS_BIBLICAS.length;
  el.innerHTML = `<i class="fas fa-book-open" style="margin-right:4px; opacity:0.6"></i> "${MENSAGENS_BIBLICAS[index]}"`;
}
