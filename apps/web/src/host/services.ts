import { HostConnection } from './HostConnection';
import { PlayerHub } from './PlayerHub';

/** Serviços partilhados por todas as cenas. */
export const connection = new HostConnection();
export const hub = new PlayerHub(connection);
