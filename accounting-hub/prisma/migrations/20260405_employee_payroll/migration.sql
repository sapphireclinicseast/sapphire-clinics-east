-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('DAILY', 'MONTHLY');
CREATE TYPE "EmployeeRequestType" AS ENUM ('LEAVE', 'OVERTIME', 'UNDERTIME', 'CHANGE_SCHEDULE', 'CERTIFICATE_OF_EMPLOYMENT');
CREATE TYPE "LeaveType" AS ENUM ('VACATION', 'SICK', 'EMERGENCY', 'MATERNITY', 'PATERNITY', 'BEREAVEMENT', 'UNPAID');
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');
CREATE TYPE "TimekeepingSource" AS ENUM ('BIOMETRIC', 'MANUAL');
CREATE TYPE "HolidayType" AS ENUM ('REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING');
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateTable: Employee
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "externalStaffId" TEXT,
    "employeeBioId" INTEGER,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "department" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "jobTitle" TEXT,
    "rateType" "RateType" NOT NULL DEFAULT 'DAILY',
    "dailyRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "monthlyRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sssNumber" TEXT,
    "philhealthNumber" TEXT,
    "pagibigNumber" TEXT,
    "tinNumber" TEXT,
    "dateHired" TIMESTAMP(3),
    "regularizationDate" TIMESTAMP(3),
    "scheduleIn" TEXT NOT NULL DEFAULT '08:00',
    "scheduleOut" TEXT NOT NULL DEFAULT '17:00',
    "restDay" TEXT NOT NULL DEFAULT 'SUNDAY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeeSettings
CREATE TABLE "EmployeeSettings" (
    "id" TEXT NOT NULL,
    "cutoff1Start" INTEGER NOT NULL DEFAULT 1,
    "cutoff1End" INTEGER NOT NULL DEFAULT 15,
    "cutoff2Start" INTEGER NOT NULL DEFAULT 16,
    "cutoff2EndLastDay" BOOLEAN NOT NULL DEFAULT true,
    "cutoff2End" INTEGER NOT NULL DEFAULT 30,
    "standardHoursPerDay" DECIMAL(65,30) NOT NULL DEFAULT 8,
    "overtimeMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 1.25,
    "nightDiffMultiplier" DECIMAL(65,30) NOT NULL DEFAULT 0.10,
    "regularHolidayRate" DECIMAL(65,30) NOT NULL DEFAULT 2.0,
    "specialHolidayRate" DECIMAL(65,30) NOT NULL DEFAULT 1.3,
    "regularHolidayOTRate" DECIMAL(65,30) NOT NULL DEFAULT 2.6,
    "specialHolidayOTRate" DECIMAL(65,30) NOT NULL DEFAULT 1.69,
    "restDayRate" DECIMAL(65,30) NOT NULL DEFAULT 1.3,
    "restDayRegHolidayRate" DECIMAL(65,30) NOT NULL DEFAULT 2.6,
    "restDaySpecHolidayRate" DECIMAL(65,30) NOT NULL DEFAULT 1.5,
    "sssEnabled" BOOLEAN NOT NULL DEFAULT true,
    "philhealthEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pagibigEnabled" BOOLEAN NOT NULL DEFAULT true,
    "taxEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeeRequest
CREATE TABLE "EmployeeRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestType" "EmployeeRequestType" NOT NULL,
    "leaveType" "LeaveType",
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "reason" TEXT,
    "attachment" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TimekeepingUpload
CREATE TABLE "TimekeepingUpload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "branch" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimekeepingUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable: TimekeepingRecord
CREATE TABLE "TimekeepingRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "uploadId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "timeIn" TIMESTAMP(3),
    "timeOut" TIMESTAMP(3),
    "hoursWorked" DECIMAL(65,30),
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "isRestDay" BOOLEAN NOT NULL DEFAULT false,
    "isHoliday" BOOLEAN NOT NULL DEFAULT false,
    "holidayType" TEXT,
    "source" "TimekeepingSource" NOT NULL DEFAULT 'BIOMETRIC',
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TimekeepingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeeBenefit
CREATE TABLE "EmployeeBenefit" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "benefitType" TEXT NOT NULL,
    "employeeShare" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "employerShare" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeeBenefit_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Holiday
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "holidayType" "HolidayType" NOT NULL,
    "branch" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable: EmployeePayslip
CREATE TABLE "EmployeePayslip" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cutoffPeriod" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "basicPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overtimePay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "holidayPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "nightDiffPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "restDayPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allowances" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grossPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sssDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "philhealthDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pagibigDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lateDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "undertimeDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "daysWorked" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hoursWorked" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "undertimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "details" JSONB,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EmployeePayslip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_externalStaffId_key" ON "Employee"("externalStaffId");
CREATE UNIQUE INDEX "Employee_employeeBioId_key" ON "Employee"("employeeBioId");
CREATE INDEX "Employee_branch_idx" ON "Employee"("branch");
CREATE INDEX "Employee_department_idx" ON "Employee"("department");
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");
CREATE INDEX "Employee_employeeBioId_idx" ON "Employee"("employeeBioId");

CREATE INDEX "EmployeeRequest_employeeId_idx" ON "EmployeeRequest"("employeeId");
CREATE INDEX "EmployeeRequest_status_idx" ON "EmployeeRequest"("status");
CREATE INDEX "EmployeeRequest_requestType_idx" ON "EmployeeRequest"("requestType");
CREATE INDEX "EmployeeRequest_startDate_idx" ON "EmployeeRequest"("startDate");

CREATE INDEX "TimekeepingUpload_uploadDate_idx" ON "TimekeepingUpload"("uploadDate");
CREATE INDEX "TimekeepingUpload_branch_idx" ON "TimekeepingUpload"("branch");

CREATE UNIQUE INDEX "TimekeepingRecord_employeeId_date_key" ON "TimekeepingRecord"("employeeId", "date");
CREATE INDEX "TimekeepingRecord_employeeId_idx" ON "TimekeepingRecord"("employeeId");
CREATE INDEX "TimekeepingRecord_date_idx" ON "TimekeepingRecord"("date");
CREATE INDEX "TimekeepingRecord_uploadId_idx" ON "TimekeepingRecord"("uploadId");

CREATE INDEX "EmployeeBenefit_employeeId_idx" ON "EmployeeBenefit"("employeeId");
CREATE INDEX "EmployeeBenefit_benefitType_idx" ON "EmployeeBenefit"("benefitType");
CREATE INDEX "EmployeeBenefit_isActive_idx" ON "EmployeeBenefit"("isActive");

CREATE UNIQUE INDEX "Holiday_date_branch_key" ON "Holiday"("date", "branch");
CREATE INDEX "Holiday_date_idx" ON "Holiday"("date");
CREATE INDEX "Holiday_holidayType_idx" ON "Holiday"("holidayType");

CREATE UNIQUE INDEX "EmployeePayslip_employeeId_cutoffPeriod_branch_key" ON "EmployeePayslip"("employeeId", "cutoffPeriod", "branch");
CREATE INDEX "EmployeePayslip_employeeId_idx" ON "EmployeePayslip"("employeeId");
CREATE INDEX "EmployeePayslip_cutoffPeriod_idx" ON "EmployeePayslip"("cutoffPeriod");
CREATE INDEX "EmployeePayslip_branch_idx" ON "EmployeePayslip"("branch");
CREATE INDEX "EmployeePayslip_status_idx" ON "EmployeePayslip"("status");

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimekeepingRecord" ADD CONSTRAINT "TimekeepingRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimekeepingRecord" ADD CONSTRAINT "TimekeepingRecord_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "TimekeepingUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmployeeBenefit" ADD CONSTRAINT "EmployeeBenefit_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeePayslip" ADD CONSTRAINT "EmployeePayslip_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
