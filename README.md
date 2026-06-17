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

## Senha opcional

Para exigir senha, rode o app com a variável `APP_PASSWORD`:

```bash
APP_PASSWORD="sua-senha-forte" python3 server.py
```

Em hospedagem, configure `APP_PASSWORD` como variável de ambiente do servidor. Não coloque a senha direto no código nem envie para o GitHub.

## GitHub Pages + Google Apps Script

Também existe uma versão estática em `docs/` para publicar no GitHub Pages e usar Google Sheets como base de dados por meio do Apps Script.

### 1. Criar a base no Google

1. Crie uma planilha vazia no Google Sheets.
2. Abra `Extensões > Apps Script`.
3. Copie o conteúdo de `google-apps-script/Code.gs` para o editor.
4. Se o script não estiver vinculado à planilha, cole o ID da planilha em `SPREADSHEET_ID`.
5. Opcional: preencha `ALLOWED_EMAILS` com os e-mails autorizados.
6. Clique em `Implantar > Nova implantação`.
7. Tipo: `Aplicativo da Web`.
8. Execute como: você mesmo.
9. Quem tem acesso: escolha a opção mais restrita que atender sua equipe.
10. Copie a URL terminada em `/exec`.

Na primeira chamada, o Apps Script cria as abas e semeia os dados iniciais.

### 2. Publicar o frontend no GitHub Pages

No GitHub:

1. Vá em `Settings > Pages`.
2. Em `Build and deployment`, escolha `Deploy from a branch`.
3. Branch: `main`.
4. Folder: `/docs`.
5. Salve.

Depois abra a URL do GitHub Pages. Na primeira tela, cole a URL do Apps Script e clique em `Salvar URL`.

### Segurança nessa arquitetura

- A URL do GitHub Pages só hospeda a interface.
- Os dados ficam na sua planilha Google.
- Restrinja o Web App do Apps Script por conta Google sempre que possível.
- `ALLOWED_EMAILS` é uma camada extra, mas depende de como o Google expõe o e-mail no tipo de implantação escolhido.

## O que está incluído

- Agenda por período, operação, local e pessoa.
- Cadastro de pessoas, recursos e modelos de operação.
- Criação de operações com cálculo automático de recursos.
- Validação de conflito de pessoas, estoque simultâneo de recursos, mínimo de pessoal e equipe incompleta.
- Justificativa obrigatória para salvar uma operação com alertas.
- Ficha de execução imprimível.
