-- Corrige ordem das categorias de pizza para: Tradicional -> Especial -> Tradicional Doce -> Especial Doce
-- Seed anterior tinha Tradicional (10), Tradicional Doce (11), Especial (12), Especial Doce (13) - invertido entre Especial e Tradicional Doce
UPDATE categorias SET ordem = 10 WHERE nome = 'Pizza Tradicional';
UPDATE categorias SET ordem = 11 WHERE nome = 'Pizza Especial';
UPDATE categorias SET ordem = 12 WHERE nome = 'Pizza Tradicional Doce';
UPDATE categorias SET ordem = 13 WHERE nome = 'Pizza Especial Doce';
