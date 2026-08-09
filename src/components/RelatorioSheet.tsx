import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, downloadFile } from '../lib/api';
import type { FiltroRelatorio, Relatorio, Status, User } from '../lib/types';
import {
  diaBonito, diaCurto, diaEm, formatHM, FUSOS_COMUNS, ORIGEM_LABELS,
  primeiroDiaDoMes, somarDias, STATUS_LABELS,
} from '../lib/utils';
import styles from './RelatorioSheet.module.css';

interface Props {
  /** Fuso do gerente — o mesmo que o backend usa para cortar os dias (G10). */
  timezone: string;
  equipe: User[];
  onClose: () => void;
  /** Chamado após trocar o fuso, para a App reler o perfil do servidor. */
  onPerfilAtualizado?: () => void;
}

type Aba = 'resumo' | 'pessoas' | 'tasks' | 'extrato';

const ATALHOS = ['hoje', 'semana', 'mes', 'mesPassado', 'tudo'] as const;
type Atalho = (typeof ATALHOS)[number];

const ROTULO_ATALHO: Record<Atalho, string> = {
  hoje: 'Hoje',
  semana: 'Últimos 7 dias',
  mes: 'Este mês',
  mesPassado: 'Mês passado',
  tudo: 'Tudo',
};

function periodoDoAtalho(atalho: Atalho, hoje: string): { de: string; ate: string } {
  switch (atalho) {
    case 'hoje':
      return { de: hoje, ate: hoje };
    case 'semana':
      return { de: somarDias(hoje, -6), ate: hoje };
    case 'mes':
      return { de: primeiroDiaDoMes(hoje), ate: hoje };
    case 'mesPassado': {
      const primeiroDesteMes = primeiroDiaDoMes(hoje);
      const ultimoDoPassado = somarDias(primeiroDesteMes, -1);
      return { de: primeiroDiaDoMes(ultimoDoPassado), ate: ultimoDoPassado };
    }
    case 'tudo':
      return { de: '', ate: '' };
  }
}

function montarQuery(f: FiltroRelatorio): string {
  const p = new URLSearchParams();
  if (f.de) p.set('de', f.de);
  if (f.ate) p.set('ate', f.ate);
  if (f.empresa.trim()) p.set('empresa', f.empresa.trim());
  if (f.projeto.trim()) p.set('projeto', f.projeto.trim());
  if (f.status) p.set('status', f.status);
  if (f.severidade) p.set('severidade', f.severidade);
  if (!f.incluirEspeciais) p.set('incluirEspeciais', 'false');
  const q = p.toString();
  return q ? `&${q}` : '';
}

/**
 * Relatório com período, filtros e pré-visualização.
 *
 * Antes o gerente só tinha um botão "baixar": para saber o que havia dentro,
 * precisava abrir o arquivo. Pré-visualizar na tela é o que permite ajustar o
 * recorte antes de mandar o PDF para o cliente — e é a mesma consulta, só que
 * pedindo `format=json`.
 */
export function RelatorioSheet({ timezone: fusoInicial, equipe, onClose, onPerfilAtualizado }: Props) {
  // Estado local para o seletor: a troca é persistida na hora, mas a tela não
  // pode esperar o App reler o perfil para recalcular as datas.
  const [timezone, setTimezone] = useState(fusoInicial);
  const hoje = useMemo(() => diaEm(new Date(), timezone), [timezone]);

  const [escopo, setEscopo] = useState<string>('equipe');
  const [atalho, setAtalho] = useState<Atalho>('mes');
  const [filtro, setFiltro] = useState<FiltroRelatorio>(() => ({
    ...periodoDoAtalho('mes', hoje),
    userIds: [],
    empresa: '',
    projeto: '',
    status: '',
    severidade: '',
    incluirEspeciais: true,
  }));

  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState<'pdf' | 'xlsx' | null>(null);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<Aba>('resumo');
  const [maisFiltros, setMaisFiltros] = useState(false);

  const caminho = escopo === 'equipe' ? '/reports/team' : `/reports/user/${escopo}`;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      setRelatorio(await api.get<Relatorio>(`${caminho}?format=json${montarQuery(filtro)}`));
    } catch (e) {
      setRelatorio(null);
      setErro(e instanceof ApiError ? e.message : 'Não foi possível montar o relatório.');
    } finally {
      setCarregando(false);
    }
  }, [caminho, filtro]);

  useEffect(() => { void carregar(); }, [carregar]);

  const aplicarAtalho = (a: Atalho) => {
    setAtalho(a);
    setFiltro((f) => ({ ...f, ...periodoDoAtalho(a, hoje) }));
  };

  const mudarData = (campo: 'de' | 'ate', valor: string) => {
    setAtalho('tudo');
    setFiltro((f) => ({ ...f, [campo]: valor }));
  };

  /**
   * O fuso é preferência da conta, não filtro do relatório: persistir na hora
   * evita que o gerente tenha de reconfigurar toda vez que abrir esta tela.
   */
  const trocarFuso = async (novo: string) => {
    const anterior = timezone;
    setTimezone(novo);
    try {
      await api.put('/auth/me/preferencias', { timezone: novo });
      onPerfilAtualizado?.();
    } catch (e) {
      setTimezone(anterior);
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar o fuso.');
    }
  };

  const baixar = async (formato: 'pdf' | 'xlsx') => {
    setBaixando(formato);
    setErro('');
    try {
      const nome = escopo === 'equipe' ? 'equipe' : (equipe.find((e) => e.id === escopo)?.nome ?? 'relatorio');
      const sufixo = filtro.de || filtro.ate ? `-${filtro.de || 'inicio'}_${filtro.ate || 'hoje'}` : '';
      await downloadFile(
        `${caminho}?format=${formato}${montarQuery(filtro)}`,
        `relatorio-${nome.toLowerCase().replace(/\s+/g, '-')}${sufixo}.${formato}`,
      );
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setBaixando(null);
    }
  };

  return (
    <div className="fx-overlay" onClick={onClose}>
      <div className={`fx-sheet ${styles.sheet}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <div>
            <span className={styles.titulo}>Relatório</span>
            <label className={styles.fuso}>
              Dias fechados no fuso
              <select value={timezone} onChange={(e) => trocarFuso(e.target.value)}>
                {/* Garante que um fuso fora da lista curta ainda apareça selecionado. */}
                {!FUSOS_COMUNS.some((f) => f.valor === timezone) && <option value={timezone}>{timezone}</option>}
                {FUSOS_COMUNS.map((f) => (
                  <option key={f.valor} value={f.valor}>{f.rotulo}</option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.acoesTopo}>
            <button className={styles.btnFormato} onClick={() => baixar('xlsx')} disabled={baixando !== null || !relatorio}>
              {baixando === 'xlsx' ? <div className="fx-spinner" /> : 'XLSX'}
            </button>
            <button className={styles.btnFormato} onClick={() => baixar('pdf')} disabled={baixando !== null || !relatorio}>
              {baixando === 'pdf' ? <div className="fx-spinner" /> : 'PDF'}
            </button>
          </div>
        </div>

        <div className="fx-sheet-scroll">
          <div className={styles.filtros}>
            <div className={styles.linhaChips}>
              <button className={`fx-chip ${escopo === 'equipe' ? 'active' : ''}`} onClick={() => setEscopo('equipe')}>
                Equipe inteira
              </button>
              {equipe.map((e) => (
                <button key={e.id} className={`fx-chip ${escopo === e.id ? 'active' : ''}`} onClick={() => setEscopo(e.id)}>
                  {e.nome}
                </button>
              ))}
            </div>

            <div className={styles.linhaChips}>
              {ATALHOS.map((a) => (
                <button key={a} className={`fx-chip ${atalho === a ? 'active' : ''}`} onClick={() => aplicarAtalho(a)}>
                  {ROTULO_ATALHO[a]}
                </button>
              ))}
            </div>

            <div className={styles.datas}>
              <label>
                <span>De</span>
                <input type="date" value={filtro.de} max={filtro.ate || undefined} onChange={(e) => mudarData('de', e.target.value)} />
              </label>
              <label>
                <span>Até</span>
                <input type="date" value={filtro.ate} min={filtro.de || undefined} onChange={(e) => mudarData('ate', e.target.value)} />
              </label>
              <button className={styles.linkBtn} onClick={() => setMaisFiltros((v) => !v)}>
                {maisFiltros ? 'Menos filtros' : 'Mais filtros'}
              </button>
            </div>

            {maisFiltros && (
              <div className={styles.avancados}>
                <input
                  placeholder="Empresa"
                  value={filtro.empresa}
                  onChange={(e) => setFiltro((f) => ({ ...f, empresa: e.target.value }))}
                />
                <input
                  placeholder="Projeto"
                  value={filtro.projeto}
                  onChange={(e) => setFiltro((f) => ({ ...f, projeto: e.target.value }))}
                />
                <select value={filtro.status} onChange={(e) => setFiltro((f) => ({ ...f, status: e.target.value as Status | '' }))}>
                  <option value="">Todos os status</option>
                  {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={filtro.incluirEspeciais}
                    onChange={(e) => setFiltro((f) => ({ ...f, incluirEspeciais: e.target.checked }))}
                  />
                  <span>Incluir Daily, reuniões e eventos</span>
                </label>
              </div>
            )}
          </div>

          {erro && <div className={styles.erro}>{erro}</div>}

          {carregando && !relatorio && <div className={styles.vazio}>Somando as horas…</div>}

          {relatorio && (
            <div className={carregando ? styles.desbotado : undefined}>
              <div className={styles.cartoes}>
                <Cartao rotulo="Horas no período" valor={formatHM(relatorio.horas.totalSegundos)} destaque />
                <Cartao rotulo="Trabalho" valor={formatHM(relatorio.horas.comumSegundos)} />
                <Cartao rotulo="Reuniões" valor={formatHM(relatorio.horas.especialSegundos)} />
                <Cartao rotulo="Pessoas" valor={String(relatorio.horas.porPessoa.length)} />
              </div>

              <div className={styles.abas}>
                {(['resumo', 'pessoas', 'tasks', 'extrato'] as Aba[]).map((a) => (
                  <button key={a} className={`${styles.aba} ${aba === a ? styles.abaAtiva : ''}`} onClick={() => setAba(a)}>
                    {a === 'resumo' ? 'Por dia' : a === 'pessoas' ? 'Pessoas' : a === 'tasks' ? 'Tasks' : 'Extrato'}
                  </button>
                ))}
              </div>

              {aba === 'resumo' && <PorDia relatorio={relatorio} />}
              {aba === 'pessoas' && <PorPessoa relatorio={relatorio} />}
              {aba === 'tasks' && <PorTask relatorio={relatorio} />}
              {aba === 'extrato' && <Extrato relatorio={relatorio} />}

              <div className={styles.situacao}>
                <span className={styles.secaoLabel}>Backlog hoje</span>
                <p>
                  {relatorio.situacao.totalTasks} tasks · {relatorio.situacao.concluidas} concluídas ·{' '}
                  {relatorio.situacao.pendentes} pendentes ·{' '}
                  <strong className={relatorio.situacao.atrasadas > 0 ? styles.alerta : undefined}>
                    {relatorio.situacao.atrasadas} atrasadas
                  </strong>
                </p>
                <span className={styles.nota}>
                  Esta linha é a foto de agora, não do período — por isso não muda quando você troca as datas.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Cartao({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={`${styles.cartao} ${destaque ? styles.cartaoDestaque : ''}`}>
      <span className={styles.cartaoRotulo}>{rotulo}</span>
      <span className={styles.cartaoValor}>{valor}</span>
    </div>
  );
}

function PorDia({ relatorio }: { relatorio: Relatorio }) {
  const dias = relatorio.horas.porDia;
  if (dias.length === 0) return <div className={styles.vazio}>Nenhuma hora lançada neste recorte.</div>;

  const maximo = Math.max(...dias.map((d) => d.segundos), 1);
  return (
    <div className={styles.barras}>
      {dias.map((d) => (
        <div key={d.dia} className={styles.barraLinha} title={d.porPessoa.map((p) => `${p.nome}: ${formatHM(p.segundos)}`).join('\n')}>
          <span className={styles.barraDia}>{diaCurto(d.dia)}</span>
          <div className={styles.barraTrilho}>
            <div className={styles.barra} style={{ width: `${Math.max(2, (d.segundos / maximo) * 100)}%` }} />
          </div>
          <span className={styles.barraValor}>{formatHM(d.segundos)}</span>
        </div>
      ))}
    </div>
  );
}

function PorPessoa({ relatorio }: { relatorio: Relatorio }) {
  const { porPessoa, totalSegundos } = relatorio.horas;
  if (porPessoa.length === 0) return <div className={styles.vazio}>Ninguém lançou hora neste recorte.</div>;

  return (
    <table className={styles.tabela}>
      <thead>
        <tr><th>Pessoa</th><th>Trabalho</th><th>Reuniões</th><th>Total</th><th>%</th></tr>
      </thead>
      <tbody>
        {porPessoa.map((p) => (
          <tr key={p.userId}>
            <td>
              {p.nome}
              {p.desligado && <span className={styles.tag}>desligado</span>}
            </td>
            <td>{formatHM(p.segundosComuns)}</td>
            <td>{formatHM(p.segundosEspeciais)}</td>
            <td><strong>{formatHM(p.segundos)}</strong></td>
            <td>{totalSegundos ? `${Math.round((p.segundos / totalSegundos) * 100)}%` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PorTask({ relatorio }: { relatorio: Relatorio }) {
  if (relatorio.linhas.length === 0) return <div className={styles.vazio}>Nenhuma task com hora lançada.</div>;

  return (
    <table className={styles.tabela}>
      <thead>
        <tr><th>Task</th><th>Responsável</th><th>Estim.</th><th>Período</th><th>Acum.</th></tr>
      </thead>
      <tbody>
        {relatorio.linhas.map((l) => (
          <tr key={`${l.taskId}:${l.userId}`}>
            <td>
              <span className={styles.codigo}>{l.codigo}</span> {l.titulo}
              {l.atrasada && <span className={`${styles.tag} ${styles.tagAlerta}`}>atrasada</span>}
            </td>
            <td>{l.userNome}</td>
            <td>{l.tipo === 'ESPECIAL' ? '—' : `${l.horasEstimadas.toFixed(1)}h`}</td>
            <td><strong>{l.horasNoPeriodo.toFixed(1)}h</strong></td>
            <td>{l.horasAcumuladas.toFixed(1)}h</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Extrato({ relatorio }: { relatorio: Relatorio }) {
  if (relatorio.lancamentos.length === 0) return <div className={styles.vazio}>Sem lançamentos no período.</div>;

  return (
    <>
      <table className={styles.tabela}>
        <thead>
          <tr><th>Dia</th><th>Pessoa</th><th>Task</th><th>Duração</th><th>Origem</th></tr>
        </thead>
        <tbody>
          {relatorio.lancamentos.map((l) => (
            <tr key={l.id}>
              <td>{diaBonito(l.dia)}</td>
              <td>{l.userNome}</td>
              <td><span className={styles.codigo}>{l.taskCodigo}</span> {l.taskTitulo}</td>
              <td><strong>{formatHM(l.segundos)}</strong></td>
              <td title={l.motivoAjuste ?? undefined}>
                {ORIGEM_LABELS[l.origem] ?? l.origem}
                {l.ajustadoPorNome && <span className={styles.tag}>por {l.ajustadoPorNome}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {relatorio.lancamentosTruncados && (
        <span className={styles.nota}>
          Extrato cortado nas primeiras {relatorio.lancamentos.length} linhas. Os totais acima consideram tudo — baixe o XLSX para a lista completa.
        </span>
      )}
    </>
  );
}
