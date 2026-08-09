import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { api, ApiError } from '../lib/api';
import type { Requisicao, StatusRequisicao, TipoRequisicao } from '../lib/types';
import styles from '../pages/Manager.module.css';

interface Props {
  requisicoes: Requisicao[];
  /** O master resolve qualquer uma; o gerente só as endereçadas a ele. */
  souMaster: boolean;
  meuId: string;
  onClose: () => void;
  onResolvida: () => void;
}

const TIPO_LABEL: Record<TipoRequisicao, string> = {
  REMOVER_DA_EQUIPE: 'Remover da equipe',
  MOVER_DE_EQUIPE: 'Mover de equipe',
  ALTERAR_DADOS: 'Correção de dados',
};

const STATUS_LABEL: Record<StatusRequisicao, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
  APLICADA_POR_PRAZO: 'Aplicada por prazo',
  CANCELADA: 'Cancelada',
};

function descrever(r: Requisicao): string {
  switch (r.tipo) {
    case 'REMOVER_DA_EQUIPE':
      return `${r.abertaPor.nome} quer remover ${r.alvo.nome} da sua equipe.`;
    case 'MOVER_DE_EQUIPE':
      return `${r.abertaPor.nome} quer mover ${r.alvo.nome} para a equipe de ${r.gerenteDestino?.nome ?? '—'}.`;
    case 'ALTERAR_DADOS': {
      const campos = Object.entries(r.payload ?? {})
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      return `${r.abertaPor.nome} pede correção de dados de ${r.alvo.nome} — ${campos}.`;
    }
  }
}

function textoPrazo(r: Requisicao): { texto: string; urgente: boolean } {
  const restanteMs = new Date(r.prazoEm).getTime() - Date.now();
  if (restanteMs <= 0) return { texto: 'Prazo vencido — será aplicada automaticamente', urgente: true };
  const horas = Math.floor(restanteMs / 3_600_000);
  if (horas < 24) return { texto: `Faltam ${horas}h para a aplicação automática`, urgente: true };
  return { texto: `Faltam ${Math.floor(horas / 24)} dia(s) para a aplicação automática`, urgente: false };
}

/**
 * Caixa de requisições com contagem regressiva (G2).
 *
 * O prazo aparece em toda pendência porque a regra central é o silêncio
 * aprovar: sem ver quanto falta, o gerente não tem como saber que ignorar
 * a requisição é, na prática, aceitá-la.
 */
export function RequisicoesSheet({ requisicoes, souMaster, meuId, onClose, onResolvida }: Props) {
  const [processando, setProcessando] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const resolver = async (id: string, acao: 'aprovar' | 'recusar') => {
    setProcessando(id);
    setErro('');
    try {
      await api.post(`/requisicoes/${id}/${acao}`);
      onResolvida();
    } catch (e: any) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível resolver a requisição.');
    } finally {
      setProcessando(null);
    }
  };

  const pendentes = requisicoes.filter((r) => r.status === 'PENDENTE');
  const resolvidas = requisicoes.filter((r) => r.status !== 'PENDENTE');

  return (
    <BottomSheet onClose={onClose} title="Requisições">
      <div style={{ paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {erro && <p style={{ fontSize: 11.5, color: 'var(--fx-error)' }}>{erro}</p>}

        {pendentes.length === 0 && resolvidas.length === 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--fx-text-dis)', textAlign: 'center', padding: '20px 0' }}>
            Nenhuma requisição.
          </p>
        )}

        {pendentes.map((r) => {
          const prazo = textoPrazo(r);
          // ALTERAR_DADOS é sempre decisão do master; as demais, do gerente destinatário.
          const possoResolver = souMaster || r.destinatarioId === meuId;
          return (
            <div key={r.id} className={styles.reqCard}>
              <span className={styles.reqTipo}>{TIPO_LABEL[r.tipo]}</span>
              <span className={styles.reqTexto}>{descrever(r)}</span>
              {r.justificativa && (
                <span style={{ fontSize: 11.5, color: 'var(--fx-text-3)', fontStyle: 'italic' }}>
                  “{r.justificativa}”
                </span>
              )}
              <span className={`${styles.reqPrazo} ${prazo.urgente ? styles.reqPrazoUrgente : ''}`}>
                {prazo.texto}
              </span>
              {possoResolver ? (
                <div className={styles.reqAcoes}>
                  <button
                    className="fx-btn-pill"
                    style={{ flex: 1, height: 38, fontSize: 12.5 }}
                    disabled={processando === r.id}
                    onClick={() => void resolver(r.id, 'aprovar')}
                  >
                    Aprovar
                  </button>
                  <button
                    className="fx-btn-pill"
                    style={{ flex: 1, height: 38, fontSize: 12.5 }}
                    disabled={processando === r.id}
                    onClick={() => void resolver(r.id, 'recusar')}
                  >
                    Recusar
                  </button>
                </div>
              ) : (
                <span className={styles.reqStatus}>Aguardando resposta de {r.destinatario?.nome ?? 'o administrador'}</span>
              )}
            </div>
          );
        })}

        {resolvidas.length > 0 && (
          <>
            <span className={styles.equipeLabel} style={{ marginTop: 10 }}>Resolvidas</span>
            {resolvidas.map((r) => (
              <div key={r.id} className={styles.reqCard} style={{ opacity: 0.7 }}>
                <span className={styles.reqTipo}>{TIPO_LABEL[r.tipo]}</span>
                <span className={styles.reqTexto}>{descrever(r)}</span>
                <span className={styles.reqStatus}>
                  {STATUS_LABEL[r.status]}
                  {r.observacao ? ` — ${r.observacao}` : ''}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
