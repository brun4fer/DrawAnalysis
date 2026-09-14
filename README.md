# TactiDraw / DrawAnalysis

Construtor local de apresentações de análise de futebol, construído com Next.js,
React, TypeScript, Zustand e react-konva. Uma apresentação pode combinar slides
estáticos, campos táticos, imagens e jogadas em vídeo.

## Arranque

```bash
npm install
npm run dev
```

Abra `http://localhost:3000` e use **Abrir vídeo**. O ficheiro é lido através de
um URL local do browser e nunca é enviado para um servidor.

## Tipos de slide

- título / secção;
- texto / frase;
- escalação com 4-3-3, 4-2-3-1, 4-4-2, 3-4-3 e 3-5-2;
- vídeo / jogada com o editor temporal;
- pontapé de saída;
- quadro tático;
- imagem local.

Use **Add Slide** para abrir o seletor. A coluna esquerda permite selecionar,
duplicar, eliminar e reordenar por drag and drop. O slide selecionado aparece no
editor central e as respetivas propriedades surgem à direita.

## Editor de vídeo

- player local com play/pause, scrub, volume, velocidade e fullscreen;
- corte não destrutivo por slide com pontos IN/OUT e pegas na timeline;
- navegação por segundos e frame a frame (base inicial de 25 fps);
- marcador/elipse, seta, linha, triângulo, polígono, retângulo, texto e desenho livre;
- seleção, deslocação, escala e rotação com Konva Transformer;
- coordenadas e geometrias normalizadas relativamente ao vídeo;
- intervalos `startTime`/`endTime`, tracks selecionáveis e ajustáveis;
- edição de estilo, tempo, transformação e estado de tracking;
- undo/redo global para desenhos e propriedades;
- modelo de keyframes e interpolação preparado para tracking posterior;
- entrada unificada por rato, toque e stylus.
- captura do frame com os desenhos para criar um slide de imagem;
- título e pergunta individual para cada slide;
- ordenação, eliminação e apresentação em ecrã inteiro.

Elipse, retângulo, seta e linha usam o fluxo **clique → mover → clique**. O
desenho livre continua a usar pressionar → desenhar → soltar, adequado a stylus.

## Atalhos

| Tecla | Ação |
| --- | --- |
| `Space` | Play / pause |
| `←` / `→` | Recuar / avançar 1 segundo |
| `,` / `.` | Frame anterior / seguinte |
| `Delete` | Eliminar seleção |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` ou `Ctrl+Shift+Z` | Redo |
| `Escape` | Ferramenta de seleção |
| `V E A L 3 P R T D` | Escolher ferramentas |

No polígono, use `Enter` ou duplo clique para fechar a zona.

Cada slide de vídeo pode usar apenas um excerto do ficheiro. Mova as pegas verdes
`IN` e `OUT` na faixa de vídeo ou posicione o playhead e use **Marcar IN** /
**Marcar OUT**. Ao duplicar um slide de vídeo, o ficheiro local é reutilizado e
o novo slide pode ter um corte independente.

## Preview da apresentação

Pare no momento pretendido, termine os desenhos e carregue em **Capturar frame**.
O frame e os desenhos visíveis são combinados numa única imagem, sem as pegas de
seleção. Cada slide tem duração e pergunta próprias. Use **Preview** para
percorrer a apresentação; as setas ou `Space` navegam e `Escape` sai.

## Estrutura

- `components/video`: player e controlos;
- `components/slides`: lista, seletor, renderizador e editores por tipo;
- `components/canvas`: renderização, criação e transformação dos desenhos;
- `components/timeline`: tracks e playhead;
- `components/properties`: inspector do objeto selecionado;
- `store`: estado global e histórico;
- `types`: modelos de slides e objetos temporais;
- `utils`: criação de slides, coordenadas e renderização temporal central.

O tracking automático/computer vision não faz parte desta fase. O estado,
keyframes e interpolação necessários à integração futura já estão modelados.
