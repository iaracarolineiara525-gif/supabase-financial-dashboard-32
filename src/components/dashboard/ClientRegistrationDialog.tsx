import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório").max(100, "Nome deve ter no máximo 100 caracteres"),
  document: z.string().trim().max(20, "Documento deve ter no máximo 20 caracteres").optional().or(z.literal("")),
  email: z.string().trim().email("E-mail inválido").max(255, "E-mail deve ter no máximo 255 caracteres").optional().or(z.literal("")),
  phone: z.string().trim().max(20, "Telefone deve ter no máximo 20 caracteres").optional().or(z.literal("")),
  totalValue: z.string().min(1, "Valor total é obrigatório"),
  totalInstallments: z.string().min(1, "Número de parcelas é obrigatório"),
  paymentDay: z.string().min(1, "Dia de pagamento é obrigatório"),
  description: z.string().trim().max(255, "Descrição deve ter no máximo 255 caracteres").optional().or(z.literal("")),
});

type ClientFormData = z.infer<typeof clientSchema>;

interface ClientRegistrationDialogProps {
  onClientCreated: () => void;
}

export function ClientRegistrationDialog({ onClientCreated }: ClientRegistrationDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      document: "",
      email: "",
      phone: "",
      totalValue: "",
      totalInstallments: "",
      paymentDay: "",
      description: "",
    },
  });

  const onSubmit = async (data: ClientFormData) => {
    setIsSubmitting(true);
    try {
      // Create client
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          name: data.name,
          document: data.document || null,
          email: data.email || null,
          phone: data.phone || null,
        })
        .select()
        .single();

      if (clientError) throw clientError;

      const totalValue = parseFloat(data.totalValue.replace(/[^\d,.-]/g, "").replace(",", "."));
      const totalInstallments = parseInt(data.totalInstallments);
      const paymentDay = parseInt(data.paymentDay);

      // Create contract
      const { data: contract, error: contractError } = await supabase
        .from("contracts")
        .insert({
          client_id: client.id,
          total_value: totalValue,
          start_date: new Date().toISOString().split("T")[0],
          description: data.description || null,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Create installments
      const installmentValue = totalValue / totalInstallments;
      const installments = [];
      const today = new Date();

      for (let i = 1; i <= totalInstallments; i++) {
        const dueDate = new Date(today.getFullYear(), today.getMonth() + i, paymentDay);
        installments.push({
          contract_id: contract.id,
          installment_number: i,
          total_installments: totalInstallments,
          value: installmentValue,
          due_date: dueDate.toISOString().split("T")[0],
          status: "open",
        });
      }

      const { error: installmentsError } = await supabase
        .from("installments")
        .insert(installments);

      if (installmentsError) throw installmentsError;

      toast.success("Cliente cadastrado com sucesso!");
      form.reset();
      setOpen(false);
      onClientCreated();
    } catch (error) {
      console.error("Erro ao cadastrar cliente:", error);
      toast.error("Erro ao cadastrar cliente. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <UserPlus className="h-4 w-4" />
          Novo Cliente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cadastrar Novo Cliente</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nome completo" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="document"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF/CNPJ</FormLabel>
                    <FormControl>
                      <Input placeholder="000.000.000-00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input placeholder="(00) 00000-0000" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-medium mb-4">Dados do Contrato</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="totalValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor Total *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" placeholder="1000.00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="totalInstallments"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nº de Parcelas *</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="60" placeholder="12" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="paymentDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dia de Pagamento *</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" max="31" placeholder="10" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Input placeholder="Descrição do contrato" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Salvando..." : "Cadastrar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
