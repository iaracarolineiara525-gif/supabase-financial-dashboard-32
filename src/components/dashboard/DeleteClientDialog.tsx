import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeleteClientDialogProps {
  client: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClientDeleted: () => void;
}

export function DeleteClientDialog({ client, open, onOpenChange, onClientDeleted }: DeleteClientDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!client) return;
    setIsDeleting(true);
    try {
      // First get all contracts for this client
      const { data: contracts } = await supabase
        .from("contracts")
        .select("id")
        .eq("client_id", client.id);

      if (contracts && contracts.length > 0) {
        // Delete all installments for these contracts
        const contractIds = contracts.map(c => c.id);
        await supabase
          .from("installments")
          .delete()
          .in("contract_id", contractIds);

        // Delete all contracts
        await supabase
          .from("contracts")
          .delete()
          .eq("client_id", client.id);
      }

      // Finally delete the client
      const { error } = await supabase
        .from("clients")
        .delete()
        .eq("id", client.id);

      if (error) throw error;

      toast.success("Cliente excluído com sucesso!");
      onClientDeleted();
    } catch (error) {
      toast.error("Erro ao excluir cliente");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Cliente</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o cliente <strong>{client?.name}</strong>? 
            Isso também excluirá todos os contratos e parcelas associados. 
            Esta ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Excluindo..." : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
