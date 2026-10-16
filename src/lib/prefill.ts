/** Manual company form fields (TASK-026); shared by the browser form and the server. */
export type Prefill = {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  emailSource: string;
  website: string;
  category: string;
};

export const EMPTY_PREFILL: Prefill = { name: "", address: "", city: "", phone: "", email: "", emailSource: "", website: "", category: "" };
