require('dotenv').config();
const db = require('../src/db/database');

// URLs ilustrativas por categoria (Unsplash - free, 400x300)
const fotosPorCategoria = {
  'Cachorro Quente': 'https://images.unsplash.com/photo-1612392062798-9a7bc6d82a9d?w=400&h=300&fit=crop', // hotdog
  'Hambúrguer': 'https://images.unsplash.com/photo-1568909344668-6f14a07b56a0?w=400&h=300&fit=crop', // burger
  'Hambúrguer Artesanal': 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=400&h=300&fit=crop', // burger artesanal
  'Pizza Tradicional': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop', // pizza
  'Pizza Tradicional Doce': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop', // pizza doce
  'Pizza Especial': 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop',
  'Pizza Especial Doce': 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400&h=300&fit=crop',
  'Açaí': 'https://images.unsplash.com/photo-1488477181946-64290103bb53?w=400&h=300&fit=crop', // acai
  'Sobremesas': 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&h=300&fit=crop', // trufa/torta
  'Porções': 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=300&fit=crop', // batata
  'Bebidas': 'https://images.unsplash.com/photo-1553456558-aff63285bdd1?w=400&h=300&fit=crop', // refrigerante
  'Sucos': 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=300&fit=crop', // suco
  'Sucos especiais': 'https://images.unsplash.com/photo-1525385133512-43d7c8682dd0?w=400&h=300&fit=crop',
  'MILK-SHAKE': 'https://images.unsplash.com/photo-1579954115545-a95591f99d40?w=400&h=300&fit=crop',
};

async function main() {
  await db.initialize();
  const categorias = await db.all('SELECT id, nome FROM categorias');
  const catMap = new Map(categorias.map(c => [c.id, c.nome.trim()]));
  const produtos = await db.all('SELECT id, nome, categoria_id, foto FROM produtos ORDER BY categoria_id, nome');
  let atualizados = 0;
  for (const p of produtos) {
    const catNome = catMap.get(p.categoria_id) || '';
    // normalizar nome para busca (trim)
    let foto = null;
    // tenta match exato, senão tenta includes
    for (const [k, url] of Object.entries(fotosPorCategoria)) {
      if (catNome.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(catNome.toLowerCase())) {
        foto = url;
        break;
      }
    }
    if (!foto) foto = fotosPorCategoria['Porções']; // fallback
    // adicionar seed por produto para variar cache (picsum usa lock diferente, unsplash com mesmo url ganha cache, adicionar query)
    const fotoComSeed = foto + `&seed=${p.id}`;
    if (!p.foto) {
      await db.run('UPDATE produtos SET foto = $1 WHERE id = $2', fotoComSeed, p.id);
      atualizados++;
      console.log(`✓ ${p.nome} (${catNome}) -> ${fotoComSeed.slice(0,60)}...`);
    }
  }
  console.log(`\nAtualizados: ${atualizados}/${produtos.length}`);
  await db.close();
}

main().catch(e => { console.error(e); process.exit(1); });
