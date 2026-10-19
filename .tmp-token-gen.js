require('dotenv').config();
const jwt=require('jsonwebtoken');
const s=process.env.JWT_SECRET;
console.log('secret len', s?s.length:0);
const payload={id:1, usuario:'demo', nome:'Demo', perfil:'admin', trocar_senha:false};
const token=jwt.sign(payload, s, {expiresIn:'2h'});
console.log(token);
const decoded=jwt.verify(token,s);
console.log(JSON.stringify(decoded));
