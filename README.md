# TactiDraw / DrawAnalysis

Editor local de análise de vídeo de futebol, construído com Next.js, React,
TypeScript, Zustand e react-konva.

## Arranque

```bash
npm install
npm run dev
```

Abra `http://localhost:3000` e use **Abrir vídeo**. O ficheiro é lido através de
um URL local do browser e nunca é enviado para um servidor.

## Funcionalidades da primeira fase

- player local com play/pause, scrub, volume, velocidade e fullscreen;
- navegação por segundos e frame a frame (base inicial de 25 fps);
- marcador/elipse, seta, linha, triângulo, polígono, retângulo, texto e desenho livre;
- seleção, deslocação, escala e rotação com Konva Transformer;
- coordenadas e geometrias normalizadas relativamente ao vídeo;
- intervalos `startTime`/`endTime`, tracks selecionáveis e ajustáveis;
- edição de estilo, tempo, transformação e estado de tracking;
- undo/redo global para desenhos e propriedades;
- modelo de keyframes e interpolação preparado para tracking posterior;
- entrada unificada por rato, toque e stylus.

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

## Estrutura

- `components/video`: player e controlos;
- `components/canvas`: renderização, criação e transformação dos desenhos;
- `components/timeline`: tracks e playhead;
- `components/properties`: inspector do objeto selecionado;
- `store`: estado global e histórico;
- `types`: modelo de dados temporal;
- `utils`: coordenadas normalizadas e interpolação de keyframes.

O tracking automático/computer vision não faz parte desta fase. O estado,
keyframes e interpolação necessários à integração futura já estão modelados.
