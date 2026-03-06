import {
  isFileRecord,
  isImageRecord,
  type ClipboardRecord,
} from "../../types/clipboard";
import { FileCard } from "./FileCard";
import { ImageCard } from "./ImageCard";
import { TextCard } from "./TextCard";

interface CardListProps {
  records: ClipboardRecord[];
  selectedIndex: number;
}

export const CardList = ({ records, selectedIndex }: CardListProps) => {
  return (
    <div
      className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-testid="card-list"
    >
      {records.map((record, index) => {
        if (isImageRecord(record)) {
          return (
            <ImageCard
              key={record.id}
              index={index}
              isSelected={selectedIndex === index}
              record={record}
            />
          );
        }

        if (isFileRecord(record)) {
          return (
            <FileCard
              key={record.id}
              index={index}
              isSelected={selectedIndex === index}
              record={record}
            />
          );
        }

        return (
          <TextCard
            key={record.id}
            index={index}
            isSelected={selectedIndex === index}
            record={record}
          />
        );
      })}
    </div>
  );
};
