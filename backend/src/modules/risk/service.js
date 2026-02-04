// Risk module - validates orders before execution
export function validateOrderRisk(account, instrument, side, quantity, price) {
  const errors = [];
  
  // Calculate order value
  const orderValue = quantity * price;
  
  if (side === 'BUY') {
    // Check sufficient cash
    if (orderValue > Number(account.cashBalance)) {
      errors.push({
        code: 'INSUFFICIENT_FUNDS',
        message: `Insufficient funds. Required: $${orderValue.toFixed(2)}, Available: $${Number(account.cashBalance).toFixed(2)}`
      });
    }
    
    // Position size limit (max 25% of portfolio in single stock for equity)
    if (instrument.type === 'EQUITY') {
      const maxPositionValue = Number(account.cashBalance) * 0.25;
      if (orderValue > maxPositionValue) {
        errors.push({
          code: 'POSITION_SIZE_LIMIT',
          message: `Order exceeds 25% portfolio concentration limit`
        });
      }
    }
  }
  
  // Instrument-specific rules
  if (instrument.type === 'OPTION' && side === 'SELL') {
    errors.push({
      code: 'OPTION_SELL_DISABLED',
      message: 'Selling options is not allowed in this simulation'
    });
  }
  
  // Futures margin check
  if (instrument.type === 'FUTURE') {
    const marginRequired = orderValue * 0.1; // 10% margin
    if (marginRequired > Number(account.marginBalance) + Number(account.cashBalance)) {
      errors.push({
        code: 'INSUFFICIENT_MARGIN',
        message: `Insufficient margin for futures order`
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

export default { validateOrderRisk };
