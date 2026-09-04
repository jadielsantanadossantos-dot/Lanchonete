function getToken() {
  return localStorage.getItem('auth_token');
}

function getPerfil() {
  return localStorage.getItem('auth_perfil');
}

function getNomeUsuario() {
  return localStorage.getItem('auth_nome');
}

function setSessao(token, perfil, nome) {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('auth_perfil', perfil);
  if (nome) localStorage.setItem('auth_nome', nome);
}

function limparSessao() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_perfil');
  localStorage.removeItem('auth_nome');
}

function verificarAuth(perfilEsperado) {
  const token = getToken();
  const perfil = getPerfil();
  if (!token || !perfil) return false;
  if (!perfilEsperado) return true;
  if (Array.isArray(perfilEsperado)) return perfilEsperado.includes(perfil);
  if (perfilEsperado && perfil !== perfilEsperado) return false;
  return true;
}

function redirecionarSemAuth(loginPage) {
  limparSessao();
  window.location.href = loginPage || '/login-admin';
}

function authFetch(url, options) {
  options = options || {};
  const token = getToken();
  if (!token) {
    return Promise.reject(new Error('Sem token de autenticação'));
  }
  options.headers = options.headers || {};
  options.headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, options).then(res => {
    if (res.status === 401) {
      limparSessao();
      const isGarcom = window.location.pathname.startsWith('/garcom');
      window.location.href = isGarcom ? '/login-garcom' : '/login-admin';
      throw new Error('Sessão expirada');
    }
    return res;
  });
}

function authPost(url, body) {
  return authFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function authPut(url, body) {
  return authFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}

function authDelete(url) {
  return authFetch(url, { method: 'DELETE' });
}

async function verificarTrocaSenhaObrigatoria(loginPage) {
  try {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) { redirecionarSemAuth(loginPage); return false; }
    const data = await res.json();
    if (data.trocar_senha) {
      mostrarModalTrocaSenha();
      return false;
    }
    return true;
  } catch (e) {
    redirecionarSemAuth(loginPage);
    return false;
  }
}