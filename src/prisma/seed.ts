import 'dotenv/config';
import {
  PrismaClient,
  UserRole,
  WorkOrderStatus,
  WorkOrderItemType,
  PaymentMethod,
  PaymentGateway,
  PaymentStatus,
  TransactionType,
  TransactionStatus,
  AppointmentStatus,
  Prisma,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Iniciando limpeza e população completa da base de dados...');

  // 1. Limpeza em ordem estrita de integridade referencial
  await prisma.paymentLog.deleteMany();
  await prisma.cashTransaction.deleteMany();
  await prisma.workOrderItem.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.vehicle.deleteMany();
  await prisma.client.deleteMany();
  await prisma.user.deleteMany();
  await prisma.service.deleteMany();
  await prisma.product.deleteMany();

  console.log('🧹 Tabelas limpas com sucesso.');

  // 2. Criação de Hash de Senha Padrão
  const passwordHash = await bcrypt.hash('Oficina@2026', 10);

  // 3. Usuários Operacionais da Oficina
  const adminUser = await prisma.user.create({
    data: {
      name: 'Carlos Gerente',
      email: 'gerente@oficina.com.br',
      passwordHash,
      phone: '11999990001',
      role: UserRole.ADMIN,
    },
  });

  const mechanicUser = await prisma.user.create({
    data: {
      name: 'Marcos Mecânico',
      email: 'mecanico@oficina.com.br',
      passwordHash,
      phone: '11999990002',
      role: UserRole.OPERATOR,
    },
  });

  // 4. Criação dos 4 Clientes Específicos com seus respectivos Usuários e Veículos
  const clientsData = [
    {
      name: 'Antonio Silva Cruz',
      document: '21458963201',
      phone: '11981112233',
      email: 'antonio.cruz@email.com',
      address: 'Av. Paulista, 1500 - Ap 42',
      city: 'São Paulo',
      state: 'SP',
      vehicle: {
        licensePlate: 'BRA2E19',
        brand: 'Toyota',
        model: 'Corolla 2.0 Altis Flex',
        year: 2022,
        color: 'Prata',
        currentKm: 38500,
        notes: 'Cliente rigoroso com prazos de revisão preventiva.',
      },
    },
    {
      name: 'Jéssica Lobo Moura Cuz',
      document: '32587419655',
      phone: '11982223344',
      email: 'jessica.lobo@email.com',
      address: 'Rua das Camélias, 88',
      city: 'São Paulo',
      state: 'SP',
      vehicle: {
        licensePlate: 'RGE3F44',
        brand: 'Jeep',
        model: 'Renegade 1.3 Turbo Longitude',
        year: 2023,
        color: 'Cinza Granite',
        currentKm: 22100,
        notes: 'Barulho relatado na suspensão dianteira ao passar em lombadas.',
      },
    },
    {
      name: 'Jovino Rodrigues',
      document: '14785236900',
      phone: '11983334455',
      email: 'jovino.rodrigues@email.com',
      address: 'Rua Barão de Itapetininga, 410',
      city: 'São Bernardo do Campo',
      state: 'SP',
      vehicle: {
        licensePlate: 'ABC1234',
        brand: 'Chevrolet',
        model: 'Onix Plus 1.0 Turbo Premier',
        year: 2021,
        color: 'Preto Ouro Negro',
        currentKm: 58000,
        notes: 'Usa o veículo para viagens frequentes de trabalho.',
      },
    },
    {
      name: 'Amanda Wyslla',
      document: '96325874102',
      phone: '11984445566',
      email: 'amanda.wyslla@email.com',
      address: 'Alameda dos Anapurus, 920',
      city: 'São Paulo',
      state: 'SP',
      vehicle: {
        licensePlate: 'MER8I90',
        brand: 'Hyundai',
        model: 'HB20 1.0 Comfort',
        year: 2020,
        color: 'Branco Polar',
        currentKm: 65400,
        notes: 'Luz da injeção acendeu no painel recentemente.',
      },
    },
  ];

  const createdClients: any[] = [];
  for (const c of clientsData) {
    const user = await prisma.user.create({
      data: {
        name: c.name,
        email: c.email,
        passwordHash,
        phone: c.phone,
        role: UserRole.CLIENT,
      },
    });

    const client = await prisma.client.create({
      data: {
        userId: user.id,
        name: c.name,
        document: c.document,
        phone: c.phone,
        email: c.email,
        address: c.address,
        city: c.city,
        state: c.state,
        vehicles: {
          create: [c.vehicle],
        },
      },
      include: {
        vehicles: true,
      },
    });

    createdClients.push(client);
  }
  console.log(`👥 4 Clientes, usuários e veículos cadastrados com sucesso.`);

  // 5. Catálogo de Serviços
  const servicesData = [
    {
      name: 'Troca de Óleo 100% Sintético e Filtro',
      description: 'Drenagem do óleo, troca do anel de vedação e filtro de óleo.',
      basePrice: new Prisma.Decimal(80.0),
      estimatedMinutes: 40,
    },
    {
      name: 'Alinhamento Técnico 3D e Balanceamento',
      description: 'Geometria de suspensão e balanceamento das 4 rodas.',
      basePrice: new Prisma.Decimal(130.0),
      estimatedMinutes: 60,
    },
    {
      name: 'Revisão do Sistema de Freios Dianteiros',
      description: 'Substituição de pastilhas, conferência de discos e sangria de fluido.',
      basePrice: new Prisma.Decimal(150.0),
      estimatedMinutes: 90,
    },
    {
      name: 'Diagnóstico Eletrônico Computadorizado (Scanner)',
      description: 'Varredura de módulos ECU/ABS/Airbag e análise de sensores.',
      basePrice: new Prisma.Decimal(120.0),
      estimatedMinutes: 45,
    },
  ];

  const createdServices: any[] = [];
  for (const s of servicesData) {
    const srv = await prisma.service.create({ data: s });
    createdServices.push(srv);
  }
  console.log(`🔧 ${createdServices.length} serviços cadastrados.`);

  // 6. Catálogo de Produtos e Peças em Estoque
  const productsData = [
    {
      sku: 'OIL-5W30-MOT',
      name: 'Óleo Motor 5W30 Sintético 1L',
      description: 'Óleo sintético API SP / ILSAC GF-6.',
      costPrice: new Prisma.Decimal(28.0),
      salePrice: new Prisma.Decimal(54.0),
      stockQuantity: 60,
      minStock: 10,
    },
    {
      sku: 'FIL-OIL-UNIV',
      name: 'Filtro de Óleo Blindado',
      description: 'Elemento filtrante de alta retenção.',
      costPrice: new Prisma.Decimal(18.0),
      salePrice: new Prisma.Decimal(38.0),
      stockQuantity: 25,
      minStock: 5,
    },
    {
      sku: 'PAS-FRE-CERAMIC',
      name: 'Jogo de Pastilhas de Freio Cerâmica',
      description: 'Pastilhas de alto rendimento sem ruído.',
      costPrice: new Prisma.Decimal(95.0),
      salePrice: new Prisma.Decimal(180.0),
      stockQuantity: 12,
      minStock: 3,
    },
    {
      sku: 'FLUID-DOT4-500',
      name: 'Fluido de Freio DOT 4 500ml',
      description: 'Fluido sintético para sistemas hidráulicos de freio.',
      costPrice: new Prisma.Decimal(22.0),
      salePrice: new Prisma.Decimal(45.0),
      stockQuantity: 18,
      minStock: 4,
    },
  ];

  const createdProducts: any[] = [];
  for (const p of productsData) {
    const prod = await prisma.product.create({ data: p });
    createdProducts.push(prod);
  }
  console.log(`📦 ${createdProducts.length} produtos cadastrados.`);

  // 7. Agendamento Futuro para Jéssica Lobo Moura Cuz
  const jessicaClient = createdClients[1];
  const jessicaVehicle = jessicaClient.vehicles[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 30, 0, 0);

  await prisma.appointment.create({
    data: {
      clientId: jessicaClient.id,
      vehicleId: jessicaVehicle.id,
      scheduledFor: tomorrow,
      status: AppointmentStatus.CONFIRMED,
      notes: 'Avaliação de ruído na suspensão dianteira ao trafegar em paralelepípedo.',
    },
  });
  console.log('📅 Agendamento futuro criado.');

  // 8. OS 1: Concluída, Faturada e Paga (Antonio Silva Cruz)
  const antonioClient = createdClients[0];
  const antonioVehicle = antonioClient.vehicles[0];
  const srvOleo = createdServices[0]; // R$ 80.00
  const prodOleo = createdProducts[0]; // 4 x R$ 54.00 = R$ 216.00
  const prodFiltro = createdProducts[1]; // 1 x R$ 38.00 = R$ 38.00
  const totalSrv1 = srvOleo.basePrice;
  const totalProd1 = prodOleo.salePrice.mul(4).add(prodFiltro.salePrice.mul(1));
  const finalAmount1 = totalSrv1.add(totalProd1); // R$ 334.00

  const osAntonio = await prisma.workOrder.create({
    data: {
      clientId: antonioClient.id,
      vehicleId: antonioVehicle.id,
      operatorId: mechanicUser.id,
      status: WorkOrderStatus.BILLED,
      reportedIssue: 'Revisão periódica de 40.000 km e troca de óleo/filtros.',
      technicalNotes: 'Óleo e filtro trocados. Verificação visual de estepe e bateria ok.',
      totalServices: totalSrv1,
      totalProducts: totalProd1,
      discount: new Prisma.Decimal(0.0),
      finalAmount: finalAmount1,
      items: {
        create: [
          {
            itemType: WorkOrderItemType.SERVICE,
            serviceId: srvOleo.id,
            quantity: 1,
            unitPrice: srvOleo.basePrice,
            totalPrice: totalSrv1,
          },
          {
            itemType: WorkOrderItemType.PRODUCT,
            productId: prodOleo.id,
            quantity: 4,
            unitPrice: prodOleo.salePrice,
            totalPrice: prodOleo.salePrice.mul(4),
          },
          {
            itemType: WorkOrderItemType.PRODUCT,
            productId: prodFiltro.id,
            quantity: 1,
            unitPrice: prodFiltro.salePrice,
            totalPrice: prodFiltro.salePrice.mul(1),
          },
        ],
      },
      finishedAt: new Date(),
    },
  });

  // Atualiza estoque da OS 1
  await prisma.product.update({
    where: { id: prodOleo.id },
    data: { stockQuantity: { decrement: 4 } },
  });
  await prisma.product.update({
    where: { id: prodFiltro.id },
    data: { stockQuantity: { decrement: 1 } },
  });

  // Transação de Caixa e Log do Gateway da OS 1
  await prisma.cashTransaction.create({
    data: {
      workOrderId: osAntonio.id,
      type: TransactionType.INCOME,
      category: 'FATURAMENTO_OS',
      amount: finalAmount1,
      paymentMethod: PaymentMethod.PIX,
      status: TransactionStatus.PAID,
      notes: `Pagamento recebido via Mercado Pago para a OS #${osAntonio.code}`,
      paidAt: new Date(),
    },
  });

  await prisma.paymentLog.create({
    data: {
      workOrderId: osAntonio.id,
      externalPaymentId: 'MP-PAY-7894561230',
      gateway: PaymentGateway.MERCADO_PAGO,
      status: PaymentStatus.APPROVED,
      payload: {
        id: 'MP-PAY-7894561230',
        status: 'approved',
        payment_method_id: 'pix',
        transaction_amount: Number(finalAmount1),
      },
    },
  });

  // 9. OS 2: Orçamento em Aberto (Amanda Wyslla)
  const amandaClient = createdClients[3];
  const amandaVehicle = amandaClient.vehicles[0];
  const srvScanner = createdServices[3]; // R$ 120.00
  const srvFreio = createdServices[2]; // R$ 150.00
  const prodPastilha = createdProducts[2]; // 1 x R$ 180.00 = R$ 180.00
  const totalSrv2 = srvScanner.basePrice.add(srvFreio.basePrice); // R$ 270.00
  const totalProd2 = prodPastilha.salePrice.mul(1); // R$ 180.00
  const finalAmount2 = totalSrv2.add(totalProd2); // R$ 450.00

  await prisma.workOrder.create({
    data: {
      clientId: amandaClient.id,
      vehicleId: amandaVehicle.id,
      operatorId: mechanicUser.id,
      status: WorkOrderStatus.QUOTE,
      reportedIssue: 'Luz da injeção acesa e pedal de freio com curso longo.',
      technicalNotes:
        'Passado scanner: falha intermitente na sonda e pastilhas no limite de espessura.',
      totalServices: totalSrv2,
      totalProducts: totalProd2,
      discount: new Prisma.Decimal(0.0),
      finalAmount: finalAmount2,
      items: {
        create: [
          {
            itemType: WorkOrderItemType.SERVICE,
            serviceId: srvScanner.id,
            quantity: 1,
            unitPrice: srvScanner.basePrice,
            totalPrice: srvScanner.basePrice,
          },
          {
            itemType: WorkOrderItemType.SERVICE,
            serviceId: srvFreio.id,
            quantity: 1,
            unitPrice: srvFreio.basePrice,
            totalPrice: srvFreio.basePrice,
          },
          {
            itemType: WorkOrderItemType.PRODUCT,
            productId: prodPastilha.id,
            quantity: 1,
            unitPrice: prodPastilha.salePrice,
            totalPrice: prodPastilha.salePrice.mul(1),
          },
        ],
      },
    },
  });

  console.log('🧾 OS #1 (Billed) e OS #2 (Quote) geradas com sucesso.');
  console.log('✅ Base de dados 100% populada e pronta para testes!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
