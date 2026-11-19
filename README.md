# amigos do mati · chart generator

Aplicação estática para montar charts com os álbuns mais ouvidos de um perfil no Last.fm.

## Usar

Abra `index.html` ou sirva a pasta em um servidor estático. Para publicar, envie os arquivos da raiz e a pasta `assets` juntos. Não há compilação nem dependências de produção para instalar.

Após atualizar uma instalação existente, recarregue a página. As referências aos scripts e ao CSS incluem uma versão para evitar a combinação de arquivos antigos com a nova interface.

Preencha o usuário, escolha o período e o formato e clique em **gerar chart**. As preferências ficam neste navegador; a aplicação não consulta o Last.fm automaticamente ao abrir.

Na prévia, **ampliar** mantém as capas em um tamanho legível e permite rolagem horizontal. Cada álbum abre seus detalhes. No celular, gerar um chart leva à prévia e a barra de exportação permanece acessível.

## Exportação

O PNG é desenhado diretamente no canvas, sem carregar bibliotecas externas. Usa a identidade e o período do resultado carregado. A exportação possui cancelamento, fila de até seis capas simultâneas e um limite global de espera. Capas sem permissão de CORS ou indisponíveis recebem uma ilustração local; a interface informa a quantidade substituída.

A exportação sempre usa a qualidade padrão: até dois milhões de pixels e 2400 pixels por lado. As dimensões exatas dependem do formato; a largura e a altura são exibidas antes do download.

O link de salvar permanece disponível caso o navegador não inicie o download automaticamente. Compartilhamento nativo aparece apenas quando o navegador suporta compartilhar arquivos PNG.

## Estrutura

- `index.html` e `style.css`: interface responsiva em rosa, lilás e ciano.
- `chart-core.js`: validação, preferências, identidade e limites da imagem.
- `lastfm.js`: consultas com cancelamento, tempo limite de 15 segundos, paginação e cache de cinco minutos, limitado a 12 consultas.
- `chart-export.js`: geração de PNG, carregamento de capas e placeholders.
- `script.js`: estados e interações da interface.
- `assets/` e `favicon.ico`: identidade visual própria do projeto.
- `tests/`: verificações automatizadas, sem dependências externas.

## Testes

Com Node.js 20 ou superior:

```powershell
node --test tests/core.test.cjs tests/api.test.cjs tests/export.test.cjs tests/app.test.cjs tests/markup.test.cjs
```

Os testes cobrem a lógica com respostas simuladas, a integração dos controles e os limites dos 400 formatos possíveis em ambas as qualidades.

Verificado em 19 de novembro de 2026:

- 30 testes automatizados passaram.
- A página, `script.js`, `lastfm.js` e `chart-export.js` responderam com HTTP 200 em um servidor estático local.
- A consulta real ao Last.fm não foi realizada nesta verificação.

## Conferência manual

1. Gerar um chart com um usuário válido e confirmar que a grade substitui a tela vazia.
2. Trocar de período durante uma busca e conferir que aparece o período mais recente.
3. Alterar de 5 × 5 para 6 × 6 e confirmar a busca de 36 álbuns, se disponíveis.
4. Testar usuário inexistente, resultado sem álbuns e conexão indisponível.
5. Abrir detalhes por toque e teclado; fechar com o botão ou Escape.
6. Em 320, 390, 760 e 1280 pixels, conferir campos, grade ajustada e rolagem ampliada.
7. Exportar 1 × 20, 20 × 1 e 20 × 20; cancelar uma exportação e iniciar outra.
8. Conferir as capas no PNG, o link manual de salvar e o compartilhamento, quando disponível.

Os dados dependem da disponibilidade do Last.fm. A chave pública da API usada pelo projeto está configurada em `script.js`.
