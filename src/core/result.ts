export type Result<T, E = any> =
    | { success: true; data: T }
    | { success: false; error: E };

export const Result = {
    ok: <T>(data: T): Result<T, never> => ({ success: true, data }),
    fail: <E>(error: E): Result<never, E> => ({ success: false, error }),
};
