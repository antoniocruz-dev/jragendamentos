import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, IsBoolean, ValidateIf } from 'class-validator';
import { ExpensePayer, PaymentMethod, TaxRegime } from '@prisma/client';
import { EXPENSE_CATEGORIES } from '../financial-calc.js';

export class CreateExpenseDto {
  /** PAID (padrão): despesa já paga. PENDING: conta a pagar, com vencimento e sem data de pagamento. */
  @IsOptional()
  @IsIn(['PAID', 'PENDING'], { message: 'Situação inválida: use PAID (paga) ou PENDING (a pagar).' })
  status?: 'PAID' | 'PENDING';

  @ValidateIf((o: CreateExpenseDto) => o.status !== 'PENDING')
  @IsDateString({}, { message: 'Data da despesa inválida.' })
  paidAt?: string;

  /** Vencimento: obrigatório para conta a pagar. */
  @ValidateIf((o: CreateExpenseDto) => o.status === 'PENDING' || (o.dueDate !== undefined && o.dueDate !== null))
  @IsDateString({}, { message: 'Informe o vencimento da conta a pagar.' })
  dueDate?: string | null;

  @IsString()
  @IsNotEmpty({ message: 'Descreva a despesa.' })
  @Length(2, 255)
  description: string;

  @IsIn(Object.keys(EXPENSE_CATEGORIES), { message: 'Categoria inválida.' })
  category: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor inválido (use até 2 casas decimais).' })
  @Min(0.01, { message: 'O valor deve ser maior que zero.' })
  amount: number;

  @IsEnum(PaymentMethod, { message: 'Forma de pagamento inválida.' })
  paymentMethod: PaymentMethod;

  @IsEnum(ExpensePayer, { message: 'Informe quem pagou: CAIXA ou SOCIO.' })
  paidBy: ExpensePayer;

  /** Obrigatório para pagamento de comissão: o mecânico que recebeu. */
  @IsOptional()
  @IsUUID('all', { message: 'Mecânico inválido.' })
  beneficiaryId?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

/** Baixa de uma conta a pagar: vira despesa paga (data de hoje, se não informada). */
export class PayExpenseDto {
  @IsOptional()
  @IsDateString({}, { message: 'Data do pagamento inválida.' })
  paidAt?: string;

  @IsOptional()
  @IsEnum(PaymentMethod, { message: 'Forma de pagamento inválida.' })
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsEnum(ExpensePayer, { message: 'Informe quem pagou: CAIXA ou SOCIO.' })
  paidBy?: ExpensePayer;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsEnum(TaxRegime, { message: 'Regime tributário inválido.' })
  taxRegime?: TaxRegime;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Alíquota inválida.' })
  @Min(0, { message: 'A alíquota não pode ser negativa.' })
  @Max(5, { message: 'O ISS não pode passar de 5% (LC 116/2003, art. 8º).' })
  issRate?: number;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  municipality?: string;

  @IsOptional()
  @IsString()
  @Length(1, 10)
  serviceCode?: string;

  @IsOptional()
  @IsString()
  @Length(2, 150)
  companyName?: string;
}

/** Registro do pagamento (faturamento) de uma OS concluída. */
export class BillWorkOrderDto {
  @IsEnum(PaymentMethod, { message: 'Forma de pagamento inválida.' })
  paymentMethod: PaymentMethod;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24, { message: 'Máximo de 24 parcelas.' })
  installments?: number;

  /** Data do recebimento (padrão: agora). */
  @IsOptional()
  @IsDateString({}, { message: 'Data de pagamento inválida.' })
  paidAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Desconto inválido.' })
  @Min(0, { message: 'O desconto não pode ser negativo.' })
  discount?: number;

  /** Mecânico responsável (base da comissão). */
  @IsUUID('all', { message: 'Informe o mecânico responsável.' })
  operatorId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReverseBillingDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o motivo do estorno.' })
  @Length(3, 255)
  reason: string;
}

/** Resolução da pendência de estorno de uma OS faturada que foi cancelada. */
export class ResolveRefundDto {
  /** REFUNDED: devolveu o dinheiro (cancela a entrada no caixa). WAIVED: sem devolução (a receita fica). */
  @IsIn(['REFUNDED', 'WAIVED'], { message: 'Escolha REFUNDED (estorno feito) ou WAIVED (sem estorno).' })
  resolution: 'REFUNDED' | 'WAIVED';

  /** Devolver as peças da OS ao estoque (só no estorno). */
  @IsOptional()
  @IsBoolean()
  returnStock?: boolean;

  @IsString()
  @IsNotEmpty({ message: 'Descreva o que foi feito (ex.: Pix devolvido em 25/11).' })
  @Length(3, 500)
  notes: string;
}
