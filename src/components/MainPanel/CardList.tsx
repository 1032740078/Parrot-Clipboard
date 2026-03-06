import type { ClipboardRecord } from "../../types/clipboard";
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
      {records.map((record, index) => (
        <TextCard key={record.id} index={index} isSelected={selectedIndex === index} record={record} />
      ))}
    </div>
  );
};
