import * as bcrypt from 'bcrypt';

// Runs inside a piscina worker_thread, one task per thread at a time — a
// worker_thread has its own libuv threadpool separate from the main
// process's, so using the *Sync variants here (blocking that worker for the
// duration of the hash) gives bcrypt a genuinely isolated pool of threads
// instead of competing with DNS/zlib/fs work on the main process's pool.

export function hash({ password, rounds }: { password: string; rounds: number }): string {
    return bcrypt.hashSync(password, rounds);
}

export function compare({ password, encrypted }: { password: string; encrypted: string }): boolean {
    return bcrypt.compareSync(password, encrypted);
}
