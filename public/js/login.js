document.getElementById('login-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  const errEl = document.getElementById('auth-error');
  errEl.classList.remove('show');

  const btn = document.getElementById('login-btn');
  const usuario = document.getElementById('usuario').value.trim();
  const senha = document.getElementById('senha').value;

  if (!usuario || !senha) {
    errEl.textContent = 'Informe usuário e senha';
    errEl.classList.add('show');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha, perfil_esperado: window.LOGIN_PERFIL })
    });

    const data = await res.json();

    if (!res.ok) {
      errEl.textContent = data.error || 'Erro ao fazer login';
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Entrar';
      return;
    }

    setSessao(data.token, data.perfil, data.nome);

    // Sessao autenticada em ambos os casos - sem a flag o painel
    // devolve para o login antes mesmo do modal de troca de senha
    sessionStorage.setItem(window.LOGIN_PERFIL === 'admin' ? 'admin_logged_in' : 'garcom_logged_in', '1');

    if (data.trocar_senha) {
      window.location.href = window.LOGIN_PERFIL === 'garcom' ? '/garcom' : '/alterar-senha';
    } else {
      window.location.href = window.LOGIN_PERFIL === 'admin' ? '/admin' : '/garcom';
    }
  } catch (e) {
    errEl.textContent = 'Erro de conexão com o servidor';
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});