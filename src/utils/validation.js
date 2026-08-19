function validarCampoObrigatorio(obj, campos) {
  const faltando = campos.filter(c => obj[c] === undefined || obj[c] === null || obj[c] === '');
  if (faltando.length > 0) {
    return `Campos obrigatórios: ${faltando.join(', ')}`;
  }
  return null;
}

function validarTipo(valor, tipo, nomeCampo) {
  switch (tipo) {
    case 'string':
      if (typeof valor !== 'string') return `${nomeCampo} deve ser uma string`;
      break;
    case 'number':
      if (typeof valor !== 'number' || isNaN(valor)) return `${nomeCampo} deve ser um número`;
      break;
    case 'boolean':
      if (typeof valor !== 'boolean') return `${nomeCampo} deve ser um booleano`;
      break;
    case 'array':
      if (!Array.isArray(valor)) return `${nomeCampo} deve ser um array`;
      break;
    case 'integer':
      if (!Number.isInteger(valor)) return `${nomeCampo} deve ser um inteiro`;
      break;
  }
  return null;
}

function validarTamanho(valor, min, max, nomeCampo) {
  if (typeof valor === 'string') {
    if (valor.length < min) return `${nomeCampo} deve ter no mínimo ${min} caracteres`;
    if (valor.length > max) return `${nomeCampo} deve ter no máximo ${max} caracteres`;
  }
  return null;
}

function validarEnum(valor, valoresPermitidos, nomeCampo) {
  if (!valoresPermitidos.includes(valor)) {
    return `${nomeCampo} deve ser um de: ${valoresPermitidos.join(', ')}`;
  }
  return null;
}

function validarPositivo(valor, nomeCampo) {
  if (typeof valor === 'number' && valor < 0) {
    return `${nomeCampo} deve ser um número positivo`;
  }
  return null;
}

function sanitizarString(str) {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
}

function validarTelefone(telefone) {
  if (!telefone) return null;
  const limpo = telefone.replace(/\D/g, '');
  if (limpo.length < 10 || limpo.length > 11) {
    return 'Telefone inválido';
  }
  return null;
}

function validarEmail(email) {
  if (!email) return null;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email)) return 'Email inválido';
  return null;
}

function criarValidador(regras) {
  return (req, res, next) => {
    const erros = [];
    const body = req.body || {};

    for (const [campo, regra] of Object.entries(regras)) {
      const valor = body[campo];

      if (regra.obrigatorio) {
        const erro = validarCampoObrigatorio({ [campo]: valor }, [campo]);
        if (erro) {
          erros.push(erro);
          continue;
        }
      }

      if (valor !== undefined && valor !== null && valor !== '') {
        if (regra.tipo) {
          const erro = validarTipo(valor, regra.tipo, campo);
          if (erro) erros.push(erro);
        }

        if (regra.tamanho) {
          const erro = validarTamanho(valor, regra.tamanho.min, regra.tamanho.max, campo);
          if (erro) erros.push(erro);
        }

        if (regra.enum) {
          const erro = validarEnum(valor, regra.enum, campo);
          if (erro) erros.push(erro);
        }

        if (regra.positivo) {
          const erro = validarPositivo(valor, campo);
          if (erro) erros.push(erro);
        }

        if (regra.telefone) {
          const erro = validarTelefone(valor);
          if (erro) erros.push(erro);
        }

        if (regra.email) {
          const erro = validarEmail(valor);
          if (erro) erros.push(erro);
        }
      }
    }

    if (erros.length > 0) {
      return res.status(400).json({ error: 'Dados inválidos', detalhes: erros });
    }

    for (const [campo, regra] of Object.entries(regras)) {
      if (regra.sanitizar && body[campo]) {
        req.body[campo] = sanitizarString(body[campo]);
      }
    }

    next();
  };
}

module.exports = {
  validarCampoObrigatorio,
  validarTipo,
  validarTamanho,
  validarEnum,
  validarPositivo,
  sanitizarString,
  validarTelefone,
  validarEmail,
  criarValidador
};