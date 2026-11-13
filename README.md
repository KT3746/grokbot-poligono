# POLÍGONO

Estande de tiro ao alvo no navegador — atmosfera indoor séria, precisa e adulta. Interface em **português (Brasil)**, mobile-first (jogável com uma mão no celular) e também no PC.

**Jogar:** https://kt3746.github.io/grokbot-poligono/

## Como jogar

1. Toque em **Entrar no estande**.
2. Escolha **Treino** (prática sem tempo) ou **Desafio** (60s, meta de pontos).
3. Mire nos alvos de papel ou aço (estáticos e móveis).
4. Acerte **centro**, **anel** ou **borda** — o centro vale mais e alimenta o combo.

## Controles

| Dispositivo | Mirar | Disparar | Pausar |
|-------------|-------|----------|--------|
| Celular | Arrastar o dedo na tela | Botão **FOGO** (canto inferior direito) | Botão **II** |
| PC | Mover o mouse | Clique ou **Espaço** | **Esc** ou **II** |

Som (mudo), a dica de primeira vez e o **melhor do dia** (precisão / combo) ficam salvos no aparelho (`localStorage`, dia em horário de Brasília).

## Modos

- **Treino** — sem cronômetro; foque em precisão e combo. Use **Encerrar** no menu de pausa para terminar a sessão e ver o resultado.
- **Desafio** — 60 segundos, ondas com mais alvos móveis, meta de 1200 pontos.

## Onda 7

- **10 SEGUNDOS!** aviso + vibração nos finais do Desafio
- **AÇO!** ao acertar alvo de aço
- **SALVO! +40** ao pegar alvo que está sumindo
- **Sessão limpa!** no resultado se não errou nenhum tiro

## Onda 8

- **Alvos grandes e espalhados**: a câmera enquadra a raia em qualquer tela (antes os alvos ficavam amontoados num pedacinho do meio); raias em degraus e alvos que não nascem encostados
- **Mira de touchpad no celular**: arraste o dedo em qualquer lugar e a mira anda junto - o dedo não cobre mais o alvo
- **Desafio vai até o fim**: bater 1200 pts mostra **META BATIDA!** e o tempo segue valendo pontos; ondas apertam pelo tamanho do alvo (máx. 6 na tela)
- **Recorde do Desafio** salvo no aparelho: aparece no botão do modo e no resultado ("faltaram N para bater"); quem não bate a meta vê quantos pontos faltaram

Cache `?v=202611122330`.

## Técnico

Site estático (HTML/CSS/JS vanilla). Visual do estande em **Three.js** (CDN jsDelivr `three.module.min.js` via import map, boot em módulo). Mira, marcadores e HUD em overlay 2D. Caminhos relativos para GitHub Pages em `/grokbot-poligono/`. Sem IPs licenciados.

## Licença

Uso pessoal / demonstração. Conteúdo original.
