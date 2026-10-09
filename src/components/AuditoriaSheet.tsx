import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { EntradaAuditoria, FacetasAuditoria, PaginaDeAuditoria, User } from '../lib/types';
import { dataHoraEm, diaEm, somarDias } from '../lib/utils';
import styles from './AuditoriaSheet.module.css';

interface Props {
  timezone: string;
  /** Para o filtro "quem fez" — o master já carrega a lista de pessoas. */
  pessoas: User[];
  onClose: () => void;
}

interface Filtros {
  acao: string;
  entidade: string;
  atorId: string;
  de: string;
  ate: string;
}

const VAZIO: Filtros = { acao: '', entidade: '', atorId: '', de: '', ate: '' };

/**
 * Consulta da trilha de auditoria (G8).
 *
 * A trilha era gravada desde o começo e nunca lida — existia uma tabela
 * crescendo no banco e nenhuma forma de responder "quem apagou as horas da
 * sexta?". Esta tela é a resposta, e é exclusiva do master: é a única visão do
 * sistema que enxerga inclusive o que os gerentes fizeram.
 */
export function AuditoriaSheet({ timezone, pessoas, onClose }: Props) {
  const hoje = useMemo(() => diaEm(new Date(), timezone), [timezone]);

  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState<PaginaDeAuditoria | null>(null);
  const [facetas, setFacetas] = useState<FacetasAuditoria | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina), limite: '50' });
    for (const [chave, valor] of Object.entries(filtros)) if (valor) p.set(chave, valor);
    return p.toString();
  }, [filtros, pagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setDados(await api.get<PaginaDeAuditoria>(`/audit?${query}`));
    } catch (e) {
      setDados(null);
      setErro(e instanceof ApiError ? e.message : 'Não foi possível ler a trilha.');
    } finally {
      setCarregando(false);
    }
  }, [query]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    api.get<FacetasAuditoria>('/audit/facetas').then(setFacetas).catch(() => setFacetas(null));
  }, []);

  /** Trocar filtro sempre volta para a primeira página — senão a tela abre vazia. */
  const mudar = (campo: keyof Filtros, valor: string) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, [campo]: valor }));
  };

  const temFiltro = Object.values(filtros).some(Boolean);

  return (
    <div className="fx-overlay" onClick={onClose}>
      <div className={`fx-sheet ${styles.sheet}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <span className={styles.titulo}>Trilha de auditoria</span>
            <span className={styles.sub}>
              {dados ? `${dados.total.toLocaleString('pt-BR')} registros` : '—'} · horários em {timezone}
            </span>
          </div>
          {temFiltro && (
            <button className={styles.limpar} onClick={() => { setFiltros(VAZIO); setPagina(1); }}>
              Limpar filtros
            </button>
          )}
        </div>

        <div className="fx-sheet-scroll">
          <div className={styles.filtros}>
            <select value={filtros.acao} onChange={(e) => mudar('acao', e.target.value)}>
              <option value="">Todas as ações</option>
              {facetas?.acoes.map((a) => (
                <option key={a.valor} value={a.valor}>{a.label} ({a.total})</option>
              ))}
            </select>

            <select value={filtros.entidade} onChange={(e) => mudar('entidade', e.target.value)}>
              <option value="">Todos os objetos</option>
              {facetas?.entidades.map((e) => (
                <option key={e.valor} value={e.valor}>{e.valor} ({e.total})</option>
              ))}
            </select>

            <select value={filtros.atorId} onChange={(e) => mudar('atorId', e.target.value)}>
              <option value="">Qualquer pessoa</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>

            <input type="date" value={filtros.de} max={filtros.ate || hoje} onChange={(e) => mudar('de', e.target.value)} />
            <input type="date" value={filtros.ate} min={filtros.de || undefined} max={hoje} onChange={(e) => mudar('ate', e.target.value)} />

            <div className={styles.atalhos}>
              <button className="fx-chip" onClick={() => { setPagina(1); setFiltros((f) => ({ ...f, de: hoje, ate: hoje })); }}>
                Hoje
              </button>
              <button className="fx-chip" onClick={() => { setPagina(1); setFiltros((f) => ({ ...f, de: somarDias(hoje, -6), ate: hoje })); }}>
                7 dias
              </button>
            </div>
          </div>

          {erro && <div className={styles.erro}>{erro}</div>}
          {carregando && !dados && <div className={styles.vazio}>Lendo a trilha…</div>}
          {dados && dados.itens.length === 0 && <div className={styles.vazio}>Nenhum registro com esses filtros.</div>}

          <div className={carregando ? styles.desbotado : undefined}>
            {dados?.itens.map((e) => (
              <Linha
                key={e.id}
                entrada={e}
                timezone={dados.timezone}
                aberta={aberta === e.id}
                onToggle={() => setAberta((atual) => (atual === e.id ? null : e.id))}
              />
            ))}
          </div>

          {dados && dados.totalPaginas > 1 && (
            <div className={styles.paginacao}>
              <button className="fx-chip" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</button>
              <span>Página {dados.pagina} de {dados.totalPaginas}</span>
              <button className="fx-chip" disabled={pagina >= dados.totalPaginas} onClick={() => setPagina((p) => p + 1)}>Próxima</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Linha({
  entrada, timezone, aberta, onToggle,
}: { entrada: EntradaAuditoria; timezone: string; aberta: boolean; onToggle: () => void }) {
  const temDetalhe = Boolean(entrada.antes || entrada.depois);

  return (
    <div className={styles.linha}>
      <button className={styles.cabecalho} onClick={onToggle} disabled={!temDetalhe}>
        <div className={styles.esquerda}>
          <span className={styles.acao}>{entrada.acaoLabel}</span>
          <span className={styles.meta}>
            {entrada.atorNome} · {entrada.entidade}
            {entrada.ip && ` · ${entrada.ip}`}
          </span>
        </div>
        <span className={styles.quando}>{dataHoraEm(entrada.criadoEm, timezone)}</span>
      </button>

      {aberta && temDetalhe && (
        <div className={styles.detalhe}>
          {entrada.antes && <Bloco rotulo="Antes" dados={entrada.antes} />}
          {entrada.depois && <Bloco rotulo="Depois" dados={entrada.depois} />}
          <span className={styles.rastro}>
            id {entrada.entidadeId}
            {entrada.requestId && ` · requisição ${entrada.requestId}`}
          </span>
        </div>
      )}
    </div>
  );
}

function Bloco({ rotulo, dados }: { rotulo: string; dados: Record<string, unknown> }) {
  return (
    <div className={styles.bloco}>
      <span className={styles.blocoRotulo}>{rotulo}</span>
      <pre>{JSON.stringify(dados, null, 2)}</pre>
    </div>
  );
}
