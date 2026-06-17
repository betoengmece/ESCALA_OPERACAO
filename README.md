# Planejamento de Operações

Aplicação local para planejar operações, escalar pessoas e reservar recursos sem conflitos.

## Como rodar

```bash
python3 server.py
```

Abra no navegador:

```text
http://127.0.0.1:8000
```

Na primeira execução o app cria `data/operations.db` com dados iniciais importados do esboço da planilha.

## O que está incluído

- Agenda por período, operação, local e pessoa.
- Cadastro de pessoas, recursos e modelos de operação.
- Criação de operações com cálculo automático de recursos.
- Validação de conflito de pessoas, estoque simultâneo de recursos, mínimo de pessoal e equipe incompleta.
- Justificativa obrigatória para salvar uma operação com alertas.
- Ficha de execução imprimível.
