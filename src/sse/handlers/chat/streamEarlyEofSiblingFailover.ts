import { isStreamEarlyEofSiblingFailoverEnabled } from "@/shared/utils/featureFlags";

export function createStreamEarlyEofSiblingFailover() {
  let originalResponse: Response | null = null;
  return {
    get original() {
      return originalResponse;
    },
    shouldHop(isTerminalEarlyEof: boolean, hasForcedConnection: boolean) {
      return (
        isTerminalEarlyEof &&
        !hasForcedConnection &&
        !originalResponse &&
        isStreamEarlyEofSiblingFailoverEnabled()
      );
    },
    remember(response: Response) {
      originalResponse = response;
    },
  };
}
