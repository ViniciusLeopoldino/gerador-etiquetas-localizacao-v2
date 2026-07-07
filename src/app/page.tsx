"use client";

import React, { useState } from 'react';
import Papa from 'papaparse';
import { jsPDF } from 'jspdf';
// @ts-ignore - Ignora a verificação estrita de tipos no build da Vercel
import bwipjs from 'bwip-js';

interface LocalizacaoRow {
  LOCALIZACAO_BRUTA: string; // Ex: R0100100101 ou qualquer texto corrido
  QUANTIDADE?: string;
}

export default function GeradorEtiquetasLocalizacao() {
  const [csvData, setCsvData] = useState<LocalizacaoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState({ rua: '', modulo: '', andar: '', comp: '', qtd: '1' });
  const [isPadrao, setIsPadrao] = useState(true); // Flag de "Etiqueta Padrão"

  // Função para aplicar a máscara 3-3-3-2 dinamicamente
  const formatarComoPadrao = (texto: string) => {
    const limpo = texto.replace(/\s+/g, '');
    const p1 = limpo.substring(0, 3);
    const p2 = limpo.substring(3, 6);
    const p3 = limpo.substring(6, 9);
    const p4 = limpo.substring(9, 11);

    let resultado = p1;
    if (p2) resultado += ` - ${p2}`;
    if (p3) resultado += ` - ${p3}`;
    if (p4) resultado += ` - ${p4}`;
    return resultado;
  };

  const handleAddManual = () => {
    if (!manual.rua || !manual.modulo || !manual.andar || !manual.comp) {
      setError('Preencha todos os campos da localização.');
      return;
    }

    // Junta as entradas dos inputs de forma corrida
    const localizacaoCorrida = `${manual.rua.trim()}${manual.modulo.trim()}${manual.andar.trim()}${manual.comp.trim()}`;

    setCsvData([...csvData, {
      LOCALIZACAO_BRUTA: localizacaoCorrida,
      QUANTIDADE: manual.qtd || '1'
    }]);

    setManual({ rua: '', modulo: '', andar: '', comp: '', qtd: '1' });
    setError('');
  };

  const downloadTemplate = () => {
    const csvContent = "\uFEFFLOCALIZACAO;QUANTIDADE\n" +
                       "R0100100101;1\n" +
                       "0500500202;3\n" +
                       "ABCDEFGHIJK;2";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "modelo_etiqueta_corrida.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true, skipEmptyLines: true, delimiter: ";",
        complete: (results: any) => {
          const validData = results.data.map((row: any) => {
            const loc = String(row.LOCALIZACAO || '').toUpperCase().trim();
            if (!loc) return null;

            return {
              LOCALIZACAO_BRUTA: loc,
              QUANTIDADE: String(row.QUANTIDADE || '1').trim()
            };
          }).filter((row: any) => row !== null);

          setCsvData(prev => [...prev, ...validData]);
          event.target.value = '';
        }
      });
    }
  };

  const desenharSetaEstreita = (doc: jsPDF, x: number, y: number, direcao: 'up' | 'down') => {
    doc.setFillColor(0, 0, 0);
    const larguraSeta = 12;
    const centroSeta = x + (larguraSeta / 2);

    if (direcao === 'up') {
      doc.rect(centroSeta - 2.5, y + 10, 5, 12, 'F');
      doc.triangle(x + 1, y + 10, centroSeta, y + 1, x + larguraSeta - 1, y + 10, 'F');
    } else {
      doc.rect(centroSeta - 2.5, y + 1, 5, 12, 'F');
      doc.triangle(x + 1, y + 13, centroSeta, y + 22, x + larguraSeta - 1, y + 13, 'F');
    }
  };

  const generatePDF = async () => {
    if (csvData.length === 0) return;
    setLoading(true);
    setError('');

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [100, 30],
    });

    const generateBarcode = (text: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        try {
          bwipjs.toCanvas(canvas, {
            bcid: 'code128', 
            text: text, 
            scale: 5, 
            height: 14, 
            includetext: false,
          });
          resolve(canvas.toDataURL("image/png"));
        } catch (err) {
          reject(err);
        }
      });
    };

    const carregarImagemLocal = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = url;
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
      });
    };

    let firstPage = true;

    try {
      const logoImg = await carregarImagemLocal('/logo.png');

      for (const row of csvData) {
        const loopQtd = parseInt(row.QUANTIDADE || '1', 10);
        const locBruta = row.LOCALIZACAO_BRUTA;
        
        // Define o texto que irá impresso baseado no Flag selecionado na interface
        const locFormatada = isPadrao ? formatarComoPadrao(locBruta) : locBruta;
        
        // Determinação do Andar para a Seta (Trabalha na posição do bloco do andar se for padrão, ou tenta ler o meio da string)
        const andarTexto = isPadrao && locBruta.length >= 9 ? locBruta.substring(6, 9) : locBruta;
        const andarInt = parseInt(andarTexto.replace(/\D/g, ''), 10);
        const direcaoSeta = andarInt === 1 ? 'down' : 'up';

        const larguraSeta = 12; 
        const xInicioSeta = 100 - larguraSeta - 2; 
        const hSuperior = 12; 

        const barcodeImg = await generateBarcode(locBruta);
        for (let i = 0; i < loopQtd; i++) {
          if (!firstPage) doc.addPage();
          firstPage = false;

          // --- LINHAS DIVISÓRIAS (ESTRUTURA DA ETIQUETA) ---
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.3);
          doc.line(0, hSuperior, xInicioSeta, hSuperior); 
          doc.line(52, hSuperior, 52, 30); 
          doc.line(xInicioSeta, 0, xInicioSeta, 30); 

          // --- TEXTO PRINCIPAL DA LOCALIZAÇÃO ---
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(locFormatada.length > 18 ? 18 : 26); 
          doc.text(locFormatada, xInicioSeta / 2, 9, { align: 'center' });

          // --- CÓDIGO DE BARRAS PRINCIPAL ---
          doc.addImage(barcodeImg, 'PNG', 2, hSuperior + 2, 48, 14);

          // --- CÁLCULO DE PROPORÇÃO DA LOGO ---
          const xLimiteLogo = 53;
          const larguraMaxLogo = xInicioSeta - xLimiteLogo - 2; 
          const alturaMaxLogo = 30 - hSuperior - 3; 

          let novaLarguraLogo = larguraMaxLogo;
          let novaAlturaLogo = (logoImg.height * larguraMaxLogo) / logoImg.width;

          if (novaAlturaLogo > alturaMaxLogo) {
            novaAlturaLogo = alturaMaxLogo;
            novaLarguraLogo = (logoImg.width * alturaMaxLogo) / logoImg.height;
          }

          const xLogoCentrado = xLimiteLogo + ((larguraMaxLogo - novaLarguraLogo) / 2) + 1;
          const yLogoCentrado = hSuperior + 1.5 + ((alturaMaxLogo - novaAlturaLogo) / 2);

          // --- ADICIONA A LOGO ---
          doc.addImage(logoImg, 'PNG', xLogoCentrado, yLogoCentrado, novaLarguraLogo, novaAlturaLogo);

          // --- SETA DIRECIONAL DA LONGARINA ---
          desenharSetaEstreita(doc, xInicioSeta + 1, 4, direcaoSeta);
        }
      }

      doc.save("etiquetas_posicao.pdf");
    } catch (e) {
      console.error(e);
      setError("Erro ao carregar a logo corporativa. Certifique-se de salvá-la em public/logo.png");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 flex flex-col items-center justify-center">
      <div className="w-full max-w-xl bg-slate-800 p-6 rounded-2xl shadow-2xl border border-slate-700">
        <h1 className="text-xl font-black text-center mb-1">Emissor de Etiquetas de Localização</h1>
        <p className="text-xs text-slate-400 mb-4 text-center">Formato 100mm x 30mm</p>

        {/* FLAG/SWITCH DA CONFIGURAÇÃO DA ETIQUETA */}
        <div className="mb-6 flex items-center justify-between p-3 bg-slate-950/40 rounded-xl border border-slate-700/50">
          <div className="flex flex-col">
            <span className="text-sm font-bold">Etiqueta Padrão</span>
            <span className="text-[11px] text-slate-400">Ativa a máscara de formatação (3 - 3 - 3 - 2)</span>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={isPadrao} onChange={() => setIsPadrao(!isPadrao)} className="sr-only peer" />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
        
        {error && <div className="mb-4 p-2 bg-red-500/20 border border-red-500 text-red-200 text-xs rounded text-center">{error}</div>}

        <div className="space-y-4 mb-6">
          <div className="bg-slate-950/40 p-3 rounded-lg border border-slate-700/60">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-2 tracking-wider">Endereço da Localização</span>
            <div className="grid grid-cols-4 gap-2">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 mb-1">Rua</span>
                <input placeholder="05" className="bg-slate-700 p-2 rounded text-sm outline-none border border-transparent focus:border-blue-500 text-center font-mono font-bold" value={manual.rua} onChange={e => setManual({...manual, rua: e.target.value})} />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 mb-1">Módulo</span>
                <input placeholder="005" className="bg-slate-700 p-2 rounded text-sm outline-none border border-transparent focus:border-blue-500 text-center font-mono font-bold" value={manual.modulo} onChange={e => setManual({...manual, modulo: e.target.value})} />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 mb-1">Andar</span>
                <input placeholder="001" className="bg-slate-700 p-2 rounded text-sm outline-none border border-transparent focus:border-blue-500 text-center font-mono font-bold" value={manual.andar} onChange={e => setManual({...manual, andar: e.target.value})} />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 mb-1">Compart.</span>
                <input placeholder="02" className="bg-slate-700 p-2 rounded text-sm outline-none border border-transparent focus:border-blue-500 text-center font-mono font-bold" value={manual.comp} onChange={e => setManual({...manual, comp: e.target.value})} />
              </div>
            </div>
            {manual.rua && (
              <div className="mt-3 flex justify-between px-1 text-xs font-mono">
                <span className="text-slate-400">Preview no PDF: <strong className="text-white">{isPadrao ? formatarComoPadrao(`${manual.rua}${manual.modulo}${manual.andar}${manual.comp}`) : `${manual.rua}${manual.modulo}${manual.andar}${manual.comp}`.toUpperCase()}</strong></span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 ml-1 mb-1">Nº ETIQUETAS (p/ imprimir)</span>
              <input type="number" min="1" className="bg-slate-700 p-2 rounded text-sm h-[38px] outline-none border border-transparent focus:border-blue-500 font-bold" value={manual.qtd} onChange={e => setManual({...manual, qtd: e.target.value})} />
            </div>
            <div className="flex flex-col justify-end">
              <button onClick={handleAddManual} className="bg-blue-600 cursor-pointer hover:bg-blue-500 font-bold rounded text-sm h-[38px] transition-all">
                + ADICIONAR FILA
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-slate-700 pt-6">
          <button onClick={downloadTemplate} className="bg-slate-700 cursor-pointer hover:bg-slate-600 py-2 rounded text-xs font-bold border border-slate-500">BAIXAR MODELO CSV</button>
          <label className="bg-slate-700 hover:bg-slate-600 py-2 rounded text-xs font-bold border border-slate-500 text-center cursor-pointer">
            IMPORTAR LOTE CSV <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>

        <div className="mt-6 bg-slate-950/50 p-4 rounded-xl flex justify-between items-center text-sm border border-slate-700">
          <div className="flex flex-col">
            <span className="text-slate-500 text-[10px] uppercase font-bold">Total de Localizações</span>
            <span className="text-xl font-black text-blue-400">{csvData.length}</span>
          </div>
          <button onClick={() => setCsvData([])} className="bg-red-500/10 cursor-pointer hover:bg-red-500/20 text-red-400 px-3 py-1 rounded text-xs border border-red-500/50 transition-all">
            Limpar Fila
          </button>
        </div>

        <button 
          onClick={generatePDF} 
          disabled={loading || csvData.length === 0} 
          className="w-full mt-4 bg-emerald-600 cursor-pointer hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 py-4 rounded-xl font-black text-md tracking-tight shadow-xl transition-all active:scale-95"
        >
          {loading ? 'GERANDO PDF...' : 'GERAR ETIQUETAS DE POSIÇÃO'}
        </button>
      </div>
    </div>
  );
}