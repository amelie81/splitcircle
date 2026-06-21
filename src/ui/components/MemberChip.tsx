import type { Member } from '../../domain/types';
import { fallbackName } from '../../domain/validation';
import { monogram } from '../../utils/format';

export function MemberChip({ member, full = false }: { member: Member; full?: boolean }) {
  const name = fallbackName(member);
  const display = full ? name : name.split(/\s+/)[0];
  return (
    <span className="chip" title={member.address}>
      <span className="ava">
        {member.avatarUrl ? (
          <img src={member.avatarUrl} alt="" />
        ) : (
          monogram(name)
        )}
      </span>
      <span>{display}</span>
    </span>
  );
}
