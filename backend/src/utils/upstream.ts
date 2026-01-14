import { findUpstreams } from "@/db";

/**
 * find a suitable upstream for the model
 *   if model is in the form of 'model@upstream', find the upstream with the given name
 *   otherwise, find the first available upstream for the model
 *   e.g. 'r1@deepseek' -> find the upstream with model 'r1' and name 'deepseek'
 *        'r1' -> find the first available upstream for model 'r1'
 * @param model model name, or model name with upstream name separated by '@'
 * @returns Upstream object, or undefined if not found
 */
export async function selectUpstream(model: string) {
  const m = model.match(/^(\S+)@(\S+)$/);
  if (m === null) {
    const [availables] = await findUpstreams(model);
    // TODO: implement load balancing
    return availables;
  }

  const [, model_, upstream] = m;
  if (!model_ || !upstream) {
    throw new Error("unreachable code");
  }
  const [availables] = await findUpstreams(model_, upstream);
  return availables;
}
