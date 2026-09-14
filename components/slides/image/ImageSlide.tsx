import { ImageIcon } from "lucide-react";
import type { ImageSlideContent } from "@/types/slide";

export function ImageSlide({ content }: { content: ImageSlideContent }) {
  return (
    <div className="image-slide">
      {content.imageDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={content.imageDataUrl} alt="Conteúdo do slide" style={{ objectFit: content.fit }} />
      ) : (
        <div className="image-slide-empty"><ImageIcon size={38} /><strong>Escolha uma imagem</strong><span>Pode adicionar desenhos sobre a imagem numa fase seguinte.</span></div>
      )}
    </div>
  );
}
