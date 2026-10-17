// ============================================
// MAX REPRESENTAÇÃO — SITE v4.2
// script.js
// v4.1: "Meu Pedido" (cliente edita o próprio pedido)
// v4.2: Carrinho persistente em localStorage
// ============================================

const API_BASE = "https://max-representacao-api.maxprimefotovideo.workers.dev";
const WHATSAPP_NUMERO = "5537991021468";
const WHATSAPP_MSG_PADRAO = "Olá! Vi o catálogo no site e gostaria de mais informações.";
const MINIMO_PARES = 8;

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
    if (totalPares < MINIMO_PARES) {
      aviso.classList.add("show");
      aviso.innerHTML = `<i class="fas fa-info-circle"></i> Pedido mínimo: ${MINIMO_PARES} pares. Faltam ${MINIMO_PARES - totalPares}.`;
      btnEnviar.disabled = true;
    } else {
      aviso.classList.remove("show");
      btnEnviar.disabled = false;
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
// MEU PEDIDO — Estado global
// ============================================
let meuPedidoAtual = null;      // pedido carregado
let meuPedidoChave = null;      // chave
let meuPedidoWhatsapp = null;   // whatsapp usado pra validar
let modoAdicaoAtivo = false;    // true quando tá adicionando ao pedido existente

// Variáveis "congeladas" do modo adição (não são afetadas ao fechar modal)
let modoAdicaoChave = null;
let modoAdicaoWhatsapp = null;

function abrirFormFechamento() {
  if (!carrinho || carrinho.length === 0) {
    return alert("Seu carrinho está vazio.");
  }

  chavePedidoGerada = null;
  dadosUltimoPedido = null;
  descontoRevendedor = null;
  document.getElementById("formFechamento").style.display = "flex";
  document.getElementById("telaSucesso").style.display = "none";
  document.getElementById("fpNome").value = "";
  document.getElementById("fpTelefone").value = "";
  document.getElementById("fpCidade").value = "";
  document.getElementById("fpChaveRevendedor").value = "";
  document.getElementById("descontoAviso").style.display = "none";

  const totalPares = carrinho.reduce((s, c) => s + c.qtd, 0);
  const totalValor = carrinho.reduce((s, c) => s + (c.qtd * c.preco), 0);

  let html = "";
  const porProduto = {};
  for (const it of carrinho) {
    const key = it.produto_id;
    if (!porProduto[key]) porProduto[key] = { modelo: it.modelo, cor: it.cor, itens: [] };
    porProduto[key].itens.push(it);
  }
  for (const k in porProduto) {
    const p = porProduto[k];
    html += `<div style="margin-bottom:8px"><strong>${p.modelo} — ${p.cor}</strong><br>`;
    for (const it of p.itens) {
      html += `<span style="color:var(--text-dim)">  • Nº ${it.numeracao}: ${it.qtd} ${it.qtd === 1 ? "par" : "pares"}</span><br>`;
    }
    html += `</div>`;
  }
  html += `<div class="total">Total: ${totalPares} pares · R$ ${totalValor.toFixed(2).replace(".", ",")}</div>`;
    document.getElementById("fpResumo").innerHTML = html;

  document.getElementById("modalFecharPedido").classList.add("active");
  document.body.style.overflow = "hidden";

  setTimeout(() => document.getElementById("fpNome").focus(), 300);

  // Listeners pra validação da chave de revendedor
  const inputChave = document.getElementById("fpChaveRevendedor");
  const inputTel = document.getElementById("fpTelefone");

  if (inputChave && !inputChave.dataset.listenerAdded) {
    inputChave.addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase();
      agendarValidacaoChave();
    });
    inputChave.dataset.listenerAdded = "1";
  }

  if (inputTel && !inputTel.dataset.listenerAdded) {
    inputTel.addEventListener("input", () => {
      agendarValidacaoChave();
    });
    inputTel.dataset.listenerAdded = "1";
  }
}

// Agenda validação da chave (debounce de 800ms)
function agendarValidacaoChave() {
  clearTimeout(validandoChaveTimer);
  validandoChaveTimer = setTimeout(() => validarChaveRevendedor(), 800);
}

// Valida a chave do revendedor via API
async function validarChaveRevendedor() {
  const chave = (document.getElementById("fpChaveRevendedor").value || "").trim().toUpperCase();
  const whatsapp = (document.getElementById("fpTelefone").value || "").trim();
  const aviso = document.getElementById("descontoAviso");

  if (!chave) {
    descontoRevendedor = null;
    aviso.style.display = "none";
    return;
  }

  if (!whatsapp || whatsapp.replace(/\D/g, "").length < 10) {
    descontoRevendedor = null;
    aviso.style.display = "block";
    aviso.style.background = "rgba(245,158,11,0.1)";
    aviso.style.borderColor = "var(--amarelo)";
    aviso.style.color = "var(--amarelo)";
    aviso.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Preencha o WhatsApp antes de validar a chave.`;
    return;
  }

  try {
    const res = await fetch(API_BASE + "/publico/validar-chave", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Site-Token": "max-site-2026",
      },
      body: JSON.stringify({ chave, whatsapp }),
    });
    const data = await res.json();

    if (!data.success) {
      descontoRevendedor = null;
      aviso.style.display = "block";
      aviso.style.background = "rgba(239,68,68,0.1)";
      aviso.style.borderColor = "var(--error)";
      aviso.style.color = "var(--error)";
      aviso.innerHTML = `<i class="fas fa-times-circle"></i> ${escapeHtml(data.error || "Chave inválida")}`;
      return;
    }

    // Sucesso
    descontoRevendedor = {
      valido: true,
      desconto_tipo: data.desconto_tipo,
      desconto_valor: parseFloat(data.desconto_valor) || 0,
      nome: data.nome,
    };

    const descStr = data.desconto_tipo === "percentual"
      ? `${data.desconto_valor}% de desconto`
      : `R$ ${parseFloat(data.desconto_valor).toFixed(2).replace(".", ",")} por par`;

    aviso.style.display = "block";
    aviso.style.background = "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.05))";
    aviso.style.borderColor = "var(--verde)";
    aviso.style.color = "var(--verde)";
    aviso.innerHTML = `<i class="fas fa-check-circle"></i> <div><strong>${escapeHtml(data.nome)}</strong> — Revendedor registrado<br>${descStr}</div>`;

  } catch (e) {
    console.error("[validarChaveRevendedor]", e);
    descontoRevendedor = null;
    aviso.style.display = "none";
  }
}

function fecharFormFechamento() {
  document.getElementById("modalFecharPedido").classList.remove("active");
  document.body.style.overflow = "";
}

async function confirmarFechamento() {
  const nome = document.getElementById("fpNome").value.trim();
  const telefone = document.getElementById("fpTelefone").value.trim();
  const cidade = document.getElementById("fpCidade").value.trim();
  const chaveRevendedor = (document.getElementById("fpChaveRevendedor").value || "").trim().toUpperCase();
  if (!nome) { alert("Preencha o nome"); document.getElementById("fpNome").focus(); return; }
  if (!telefone || telefone.replace(/\D/g, "").length < 10) {
    alert("Preencha um WhatsApp válido com DDD");
    document.getElementById("fpTelefone").focus();
    return;
  }

  const btn = document.getElementById("btnConfirmarFechamento");
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  try {
    const itens = carrinho.map(it => ({
      produto_id: it.produto_id,
      numeracao: it.numeracao,
      quantidade: it.qtd,
    }));

        const res = await fetch(API_BASE + "/publico/pedido-criar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Site-Token": "max-site-2026",
      },
      body: JSON.stringify({
        nome: nome,
        telefone: telefone,
        cidade_estado: cidade || null,
        itens: itens,
        chave_revendedor: chaveRevendedor || null,
      }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Erro ao enviar pedido");

    chavePedidoGerada = data.chave;

    let msg = `*NOVO PEDIDO — Site MAX Representação*\n\n`;
    msg += `Chave: ${data.chave}\n`;
    msg += `Nome: ${nome}\n`;
    msg += `WhatsApp: ${telefone}\n`;
    msg += `Cidade: ${cidade || "—"}\n\n`;
    msg += `ITENS:\n`;

    const porProduto = {};
    for (const it of carrinho) {
      const key = it.produto_id;
      if (!porProduto[key]) porProduto[key] = { modelo: it.modelo, cor: it.cor, itens: [] };
      porProduto[key].itens.push(it);
    }
    for (const k in porProduto) {
      const p = porProduto[k];
      msg += `• ${p.modelo} — ${p.cor}\n`;
      for (const it of p.itens) {
        msg += `  Nº ${it.numeracao}: ${it.qtd} ${it.qtd === 1 ? "par" : "pares"}\n`;
      }
    }

      msg += `\nTotal: ${data.total_pares} pares\n`;

    if (data.desconto_aplicado && data.desconto_aplicado > 0) {
      msg += `\n💰 *REVENDEDOR APLICADO*\n`;
      msg += `Valor original: R$ ${(data.valor_original || 0).toFixed(2).replace(".", ",")}\n`;
      msg += `Desconto: -R$ ${data.desconto_aplicado.toFixed(2).replace(".", ",")}\n`;
      msg += `*Valor com desconto: R$ ${(data.valor_estimado || 0).toFixed(2).replace(".", ",")}*\n\n`;
    } else {
      msg += `Valor estimado: R$ ${(data.valor_estimado || 0).toFixed(2).replace(".", ",")}\n\n`;
    }

    msg += `Informe esta chave para o vendedor confirmar.\n\n`;
    msg += `Qualquer dúvida, estamos à disposição para atendê-lo(a)! 😊`;  

        dadosUltimoPedido = {
      chave: data.chave,
      nome: nome,
      telefone: telefone,
      cidade: cidade || "—",
      totalPares: data.total_pares,
      valorEstimado: data.valor_estimado,
      valorOriginal: data.valor_original,
      descontoAplicado: data.desconto_aplicado,
      revendedor: data.revendedor,
      msg: msg,
    };

        mostrarTelaSucesso();

    carrinho = [];
    atualizarCarrinho();
    limparCarrinhoLocal(); // limpa do localStorage após pedido criado com sucesso
    fecharModalCarrinho();

  } catch (e) {
    console.error("[fechar-pedido]", e);
    alert("Erro ao enviar pedido: " + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-check"></i> Confirmar Pedido';
  }
}

function mostrarTelaSucesso() {
  const d = dadosUltimoPedido;
  if (!d) return;

  document.getElementById("formFechamento").style.display = "none";
  const tela = document.getElementById("telaSucesso");
  tela.style.display = "block";
  tela.innerHTML = `
    <div class="sucesso-chave">
      <div class="icon-ok"><i class="fas fa-check"></i></div>
      <h3>Pedido enviado!</h3>
      <p class="sub">Agora envie o código para o vendedor confirmar seu pedido.</p>

      <div class="caixa-chave">
        <div class="lbl">Sua chave</div>
        <div class="chave">${d.chave}</div>
      </div>

      <div class="instrucao">
        <i class="fas fa-exclamation-triangle"></i>
        Informe esta chave para o vendedor
      </div>

      <button class="btn-enviar-zap" id="btnEnviarZapSucesso">
        <i class="fab fa-whatsapp"></i> Enviar para o vendedor
      </button>

      <button class="btn-fechar-sucesso" id="btnFecharSucesso">
        Fechar
      </button>
    </div>
  `;

  const btnZap = document.getElementById("btnEnviarZapSucesso");
  if (btnZap) {
    btnZap.onclick = () => abrirWhatsApp(d.msg);
  }
  const btnFechar = document.getElementById("btnFecharSucesso");
  if (btnFechar) {
    btnFechar.onclick = () => fecharFormFechamento();
  }
}

// ============================================
// WHATSAPP — Desktop first
// ============================================
function abrirWhatsApp(mensagem) {
  const texto = encodeURIComponent(mensagem);
  const urlApp = `whatsapp://send?phone=${WHATSAPP_NUMERO}&text=${texto}`;
  const urlWeb = `https://wa.me/${WHATSAPP_NUMERO}?text=${texto}`;

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
// MEU PEDIDO — Funções principais
// ============================================

// Abrir modal de busca
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

  // NÃO limpa a chave/whatsapp se estamos em modo adição
  // (precisa manter pra saber em qual pedido adicionar)
  if (!modoAdicaoAtivo) {
    meuPedidoAtual = null;
    meuPedidoChave = null;
    meuPedidoWhatsapp = null;
  }
}

// Buscar pedido no servidor
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
      headers: {
        "Content-Type": "application/json",
        "X-Site-Token": "max-site-2026",
      },
      body: JSON.stringify({ chave, whatsapp }),
    });

    const data = await res.json();

    if (!data.success) {
      erroEl.style.display = "flex";
      erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${escapeHtml(data.error || "Pedido não encontrado")}`;
      return;
    }

    // Salva estado
    meuPedidoAtual = data.pedido;
    meuPedidoChave = chave;
    meuPedidoWhatsapp = whatsapp;

    // Fecha busca, abre visualização
    fecharBuscaPedido();
    renderizarMeuPedido();
    document.getElementById("modalMeuPedido").classList.add("active");
    document.body.style.overflow = "hidden";

  } catch (e) {
    console.error("[buscarMeuPedido]", e);
    erroEl.style.display = "flex";
    erroEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> Erro: ${escapeHtml(e.message)}`;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-search"></i> Buscar Pedido';
  }
}

// Renderizar o modal do pedido
function renderizarMeuPedido() {
  if (!meuPedidoAtual) return;

  const p = meuPedidoAtual;

  // Chave no título
  document.getElementById("meuPedidoChave").textContent = p.chave;

  // Status
  const statusEl = document.getElementById("meuPedidoStatus");
  statusEl.className = "meu-pedido-status " + (p.status || "pendente");
  const statusTexto = {
    pendente: "⏳ Aguardando aprovação do vendedor",
    aprovado: "✅ Pedido aprovado e reservado",
    rejeitado: "❌ Pedido rejeitado pelo vendedor",
  };
  statusEl.textContent = statusTexto[p.status] || p.status;

  // Itens
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

  // Bind dos botões de remover
  itensEl.querySelectorAll("[data-variacao-id]").forEach(btn => {
    btn.onclick = () => removerItemDoPedido(parseInt(btn.dataset.variacaoId), btn);
  });

  // Totais
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

    // Botão adicionar (esconde se rejeitado)
  if (p.status === "rejeitado") {
    btnAdicionar.style.display = "none";
  } else {
    btnAdicionar.style.display = "flex";
    btnAdicionar.onclick = entrarModoAdicao;
  }

  // Botão "Enviar aviso pro vendedor" (WhatsApp)
  const btnConfirmar = document.getElementById("btnConfirmarMeuPedido");
  if (btnConfirmar) {
    btnConfirmar.onclick = () => {
      enviarAvisoWhatsAppPedido();
    };
  }
}

// Envia aviso pelo WhatsApp sobre o pedido atualizado
function enviarAvisoWhatsAppPedido() {
  if (!meuPedidoAtual) return;

  const p = meuPedidoAtual;
  const whatsappNumero = WHATSAPP_NUMERO;

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

  const texto = encodeURIComponent(msg);
  const urlApp = `whatsapp://send?phone=${whatsappNumero}&text=${texto}`;
  const urlWeb = `https://wa.me/${whatsappNumero}?text=${texto}`;

  let foiParaApp = false;
  const t = setTimeout(() => {
    if (!foiParaApp && !document.hidden) {
      window.open(urlWeb, "_blank");
    }
  }, 1500);

  window.addEventListener("blur", () => { foiParaApp = true; clearTimeout(t); }, { once: true });
  window.location.href = urlApp;
}

// Remover item do pedido
async function removerItemDoPedido(variacaoId, btn) {
  if (!confirm("Remover este item do pedido?")) return;

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    const res = await fetch(API_BASE + "/publico/meu-pedido/remover-item", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Site-Token": "max-site-2026",
      },
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

    // Recarrega o pedido
    await recarregarMeuPedido();
    mostrarToastAdd("Item removido do pedido");

  } catch (e) {
    console.error("[removerItemDoPedido]", e);
    alert("Erro: " + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-trash"></i>';
  }
}

// Recarrega o pedido do servidor
async function recarregarMeuPedido() {
  try {
    const res = await fetch(API_BASE + "/publico/meu-pedido", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Site-Token": "max-site-2026",
      },
      body: JSON.stringify({
        chave: meuPedidoChave,
        whatsapp: meuPedidoWhatsapp,
      }),
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

// Entrar em modo adição (volta pro catálogo com banner)
function entrarModoAdicao() {
  // Salva as variáveis "congeladas" ANTES de fechar
  modoAdicaoChave = meuPedidoChave;
  modoAdicaoWhatsapp = meuPedidoWhatsapp;
  modoAdicaoAtivo = true;

  fecharMeuPedido();

  // Mostra o banner
  document.getElementById("bannerPedidoChave").textContent = modoAdicaoChave;
  document.getElementById("bannerVoltandoPedido").style.display = "block";

  // Rola pra cima (pro catálogo)
  window.scrollTo({ top: 0, behavior: "smooth" });
}
// Cancelar modo adição
function cancelarModoAdicao() {
  modoAdicaoAtivo = false;
  modoAdicaoChave = null;
  modoAdicaoWhatsapp = null;
  document.getElementById("bannerVoltandoPedido").style.display = "none";
  carrinho = [];
  atualizarCarrinho();
}

// Adicionar carrinho atual ao pedido existente
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
      headers: {
        "Content-Type": "application/json",
        "X-Site-Token": "max-site-2026",
      },
            body: JSON.stringify({
        chave: modoAdicaoChave,
        whatsapp: modoAdicaoWhatsapp,
        itens,
      }),
    });

    const data = await res.json();

    if (!data.success) {
      let msg = data.error || "Não foi possível adicionar";
      if (data.itens_com_erro && data.itens_com_erro.length > 0) {
        msg += "\n\nItens com problema:\n";
        for (const err of data.itens_com_erro) {
          msg += `• ${err.motivo}\n`;
        }
      }
      alert(msg);
      btn.disabled = false;
      btn.innerHTML = btnOriginal;
      return;
    }

        // Sucesso
    carrinho = [];
    atualizarCarrinho();
    fecharModalCarrinho();

    // Guarda a chave ANTES de cancelar (pra reabrir o modal certo)
    const chaveReabrir = modoAdicaoChave;
    const whatsReabrir = modoAdicaoWhatsapp;

    cancelarModoAdicao();

    // Restaura o contexto do pedido pra reabrir
    meuPedidoChave = chaveReabrir;
    meuPedidoWhatsapp = whatsReabrir;

    // Abre o modal do pedido atualizado
    await recarregarMeuPedido();
    document.getElementById("modalMeuPedido").classList.add("active");
    document.body.style.overflow = "hidden";

    let msg = `✅ ${data.itens_adicionados.length} item(ns) adicionado(s)!`;
    if (data.itens_com_erro && data.itens_com_erro.length > 0) {
      msg += ` (${data.itens_com_erro.length} com erro)`;
    }
    mostrarToastAdd(msg);

  } catch (e) {
    console.error("[adicionarCarrinhoAoPedido]", e);
    alert("Erro: " + e.message);
    btn.disabled = false;
    btn.innerHTML = btnOriginal;
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
  if (btnMeuPedido) btnMeuPedido.addEventListener("click", abrirBuscaPedido);

  const btnBuscarFechar = document.getElementById("modalBuscarPedidoFechar");
  if (btnBuscarFechar) btnBuscarFechar.addEventListener("click", fecharBuscaPedido);

  const modalBuscar = document.getElementById("modalBuscarPedido");
  if (modalBuscar) modalBuscar.addEventListener("click", (e) => {
    if (e.target.id === "modalBuscarPedido") fecharBuscaPedido();
  });

  const btnBuscar = document.getElementById("btnBuscarPedido");
  if (btnBuscar) btnBuscar.addEventListener("click", buscarMeuPedido);

  // Enter nos campos de busca
  const buscaChaveInput = document.getElementById("buscaChave");
  const buscaWhatsInput = document.getElementById("buscaWhatsapp");
  if (buscaChaveInput) {
    buscaChaveInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.toUpperCase();
      if (e.target.value.length === 6 && buscaWhatsInput) buscaWhatsInput.focus();
    });
    buscaChaveInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") buscarMeuPedido();
    });
  }
  if (buscaWhatsInput) {
    buscaWhatsInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") buscarMeuPedido();
    });
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

  // Carrega categorias primeiro, depois produtos
  carregarCategorias();
  carregarProdutos();
  mostrarBoasVindas();
});
