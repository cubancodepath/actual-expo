import { Fragment } from "react";
import { View } from "react-native";
import { ListGroup, Separator, Skeleton } from "heroui-native";

const GROUPS = 2;
const CATS_PER_GROUP = 3;

/** One collapsed group: a header line plus placeholder category rows. */
function GroupSkeleton() {
  return (
    <View>
      <View className="flex-row items-center gap-1.5 px-8 pb-2 pt-6">
        <Skeleton className="h-3 w-2/5 rounded-md" />
        <View className="flex-1" />
        <Skeleton className="h-3 w-16 rounded-md" />
      </View>

      <ListGroup className="mx-4">
        {Array.from({ length: CATS_PER_GROUP }).map((_, i) => (
          <Fragment key={i}>
            {i > 0 ? <Separator className="mx-4" /> : null}
            <View className="min-h-11 flex-row items-center gap-2 px-4 py-3">
              <Skeleton className="h-3.5 w-[45%] rounded-md" />
              <View className="flex-1" />
              <Skeleton className="h-3.5 w-14 rounded-md" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </View>
          </Fragment>
        ))}
      </ListGroup>
    </View>
  );
}

/** Placeholder for the budget table while the month's sheet is still loading. */
export function BudgetListSkeleton() {
  return (
    <View>
      {Array.from({ length: GROUPS }).map((_, i) => (
        <GroupSkeleton key={i} />
      ))}
    </View>
  );
}
