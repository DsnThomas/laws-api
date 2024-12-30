const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { TextDecoder } = require('util');

const app = express();
app.use(cors());

const db = new sqlite3.Database('./laws.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS laws (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    law_type TEXT,
    content TEXT,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});


async function fetchAndParseData(url) {
  try {
    const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url);
    const { data } = await axios.get(proxyUrl, { responseType: 'arraybuffer' });

  
    const decoder = new TextDecoder('windows-1252');
    const decodedText = decoder.decode(new Uint8Array(data));

    return parseHTML(decodedText);
  } catch (error) {
    console.error('Erro ao buscar e decodificar dados:', error.message);
    return null;
  }
}

// Processa e limpa o html
function parseHTML(html) {
  const $ = cheerio.load(html);

  // Trata o html removendo os links e styles
  $('img').remove(); 
  $('a').removeAttr('href'); 
  $('link[rel="stylesheet"]').each((_, element) => {
    // Mantem o css
    const href = $(element).attr('href');
    if (href && href.startsWith('/')) {
      $(element).attr('href', 'https://www.planalto.gov.br' + href);
    }
  });

  return $.html();
}

// Salva o html no BD
async function updateLaw(lawType, url) {
  const content = await fetchAndParseData(url);
  if (content) {
    db.run(`INSERT INTO laws (law_type, content) VALUES (?, ?)`, [lawType, content], function (err) {
      if (err) {
        return console.error(err.message);
      }
      console.log(`Lei ${lawType} atualizada no banco de dados.`);
    });
  }
}


app.get('/laws/:lawType', (req, res) => {
  const lawType = req.params.lawType;
  db.get(`SELECT content FROM laws WHERE law_type = ? ORDER BY last_updated DESC LIMIT 1`, [lawType], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao buscar dados' });
    }
    if (row) {
      res.json({ html: row.content });
    } else {
      res.status(404).json({ error: 'Lei não encontrada' });
    }
  });
});

const lawsToUpdate = [
  { type: 'codigo-civil', url: 'https://www.planalto.gov.br/ccivil_03/Leis/2002/L10406compilada.htm' },
  { type: 'processo-civil', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/1937-1946/del1608.htm' },
  { type: 'eleitoral', url: 'https://www.planalto.gov.br/ccivil_03/Leis/L4737compilado.htm' },
  { type: 'codigo-comercial', url: 'https://www.planalto.gov.br/ccivil_03/leis/lim/LIM556compilado.htm' },
  { type: 'codigo-penal', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm' },
  { type: 'constituicao-federal', url: 'https://www.planalto.gov.br/ccivil_03/constituicao/ConstituicaoCompilado.htm' },
  { type: 'codigo-tributario', url: 'https://www.planalto.gov.br/ccivil_03/leis/L5172Compilado.htm' },
  { type: 'leis-trabalho', url: 'https://www.planalto.gov.br/ccivil_03/decreto-lei/Del5452compilado.htm' },
  { type: 'defesa-consumidor', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm' },
  { type: 'advocacia', url: 'https://www.planalto.gov.br/ccivil_03/leis/l8906.htm' },
  { type: 'estatuto-deficiencia', url: 'https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm' },

];

function scheduleLawUpdates() {
  lawsToUpdate.forEach(law => {
    updateLaw(law.type, law.url);
  });
}

scheduleLawUpdates();

// Atualiza cada 24h
setInterval(scheduleLawUpdates, 24 * 60 * 60 * 1000); 


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
