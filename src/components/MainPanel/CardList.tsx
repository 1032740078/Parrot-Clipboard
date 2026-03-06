import { AnimatePresence, motion } from "framer-motion";

import { getCardMotionProps, prefersReducedMotion } from "./motion";
import { isFileRecord, isImageRecord, type ClipboardRecord } from "../../types/clipboard";
import { FileCard } from "./FileCard";
import { ImageCard } from "./ImageCard";
import { TextCard } from "./TextCard";

interface CardListProps {
  records: ClipboardRecord[];
  selectedIndex: number;
}

export const CardList = ({ records, selectedIndex }: CardListProps) => {
  const cardMotionProps = getCardMotionProps(prefersReducedMotion());

  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="card-list"
    >
      <AnimatePresence initial={false}>
        {records.map((record, index) => {
          const content = isImageRecord(record) ? (
            <ImageCard index={index} isSelected={selectedIndex === index} record={record} />
          ) : isFileRecord(record) ? (
            <FileCard index={index} isSelected={selectedIndex === index} record={record} />
          ) : (
            <TextCard index={index} isSelected={selectedIndex === index} record={record} />
          );

          return (
            <motion.div key={record.id} {...cardMotionProps}>
              {content}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
